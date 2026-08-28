import { randomUUID } from "node:crypto";
import type { BrokerOrder, RiskReview, TradeProposal } from "@alphagovernor/contracts";
import { createClientOrderId, OrderUnknownStateError, type TradingProvider } from "@alphagovernor/alpaca";
import { persistence } from "./persistence.js";
import { runtime } from "./runtime.js";

export class ExecutionService {
  constructor(private readonly provider: TradingProvider) {}
  async execute(proposal: TradeProposal, risk: RiskReview, mode: "LIVE_PAPER" | "REPLAY"): Promise<BrokerOrder> {
    if (!risk.approvedQty || !["APPROVE", "RESIZE"].includes(risk.decision)) throw new Error("Execution requires an executable persisted risk decision.");
    const clientOrderId = createClientOrderId(risk.riskDecisionId, 1);
    const timestamp = new Date().toISOString();
    const pending: BrokerOrder = { id: randomUUID(), clientOrderId, symbol: proposal.symbol, side: proposal.action === "SELL" || proposal.action === "EXIT" ? "sell" : "buy", type: "market", timeInForce: "day", status: "PENDING_SUBMIT", qty: risk.approvedQty, filledQty: 0, submittedAt: timestamp, updatedAt: timestamp };
    if (mode === "LIVE_PAPER" || persistence.available) await persistence.persistPendingOrder(pending, proposal, risk);
    runtime.orders.unshift(pending);
    const pendingAudit = runtime.appendAudit({ cycleId: proposal.cycleId, proposalId: proposal.proposalId, orderId: pending.id, eventType: "order.pending_submit", severity: "INFO", message: `Execution record persisted before ${mode === "REPLAY" ? "simulation" : "Alpaca paper"} submission.`, payload: { clientOrderId, riskDecisionId: risk.riskDecisionId } });
    if (mode === "LIVE_PAPER") await persistence.appendAudit(pendingAudit);
    if (mode === "REPLAY") {
      pending.status = "filled"; pending.filledQty = risk.approvedQty; pending.filledAvgPrice = proposal.evidence.price * (pending.side === "buy" ? 1.0002 : 0.9998); pending.updatedAt = new Date().toISOString();
      if (persistence.available) await persistence.updateOrder(pending);
      runtime.emit("order.updated", pending, proposal.cycleId);
      return pending;
    }
    try {
      const result = await this.provider.placeOrder({ symbol: proposal.symbol, side: pending.side, qty: Math.max(1, Math.floor(risk.approvedQty)), type: "market", timeInForce: "day", clientOrderId });
      const alpacaOrderId = result.order.id;
      Object.assign(pending, result.order, { id: pending.id });
      await persistence.updateOrder(pending, alpacaOrderId);
      await persistence.appendAudit(runtime.appendAudit({ cycleId: proposal.cycleId, proposalId: proposal.proposalId, orderId: pending.id, eventType: "order.submitted", severity: "INFO", message: `${proposal.symbol} order accepted by Alpaca Paper.`, payload: { clientOrderId, status: pending.status } }));
      runtime.emit("order.updated", pending, proposal.cycleId);
      return pending;
    } catch (error) {
      if (error instanceof OrderUnknownStateError) {
        const reconciled = (await this.provider.listOrders({ clientOrderId }))[0];
        if (reconciled) { const alpacaOrderId = reconciled.id; Object.assign(pending, reconciled, { id: pending.id }); await persistence.updateOrder(pending, alpacaOrderId); return pending; }
        pending.status = "UNKNOWN_RECONCILIATION_REQUIRED";
        await persistence.updateOrder(pending);
        throw error;
      }
      pending.status = "rejected"; pending.updatedAt = new Date().toISOString(); await persistence.updateOrder(pending); throw error;
    }
  }
}
