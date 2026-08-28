import { db, Prisma } from "@alphagovernor/db";
import type { BrokerOrder, RiskReview, TradeProposal } from "@alphagovernor/contracts";
import type { DecisionLineage, AuditRecord } from "./runtime.js";

const json = (value: unknown) => value as Prisma.InputJsonValue;

export class PersistenceService {
  available = false;
  async connect() {
    try { await db.$connect(); await db.$queryRaw`SELECT 1`; this.available = true; } catch { this.available = false; }
    return this.available;
  }
  async disconnect() { if (this.available) await db.$disconnect(); }
  async appendAudit(record: AuditRecord) {
    if (!this.available) return;
    await db.auditEvent.create({ data: { id: record.id, cycleId: record.cycleId, agentId: record.agentId, proposalId: record.proposalId, orderId: record.orderId, eventType: record.eventType, severity: record.severity, message: record.message, payloadJson: record.payload as Prisma.InputJsonValue | undefined, createdAt: new Date(record.createdAt) } });
  }
  async setSystemStatus(status: "RUNNING" | "PAUSED" | "RISK_OFF", providerHealthy: boolean) {
    if (!this.available) return;
    await db.systemState.upsert({ where: { id: "global" }, update: { tradingStatus: status, paperMode: true, lastProviderOkAt: providerHealthy ? new Date() : undefined }, create: { id: "global", tradingStatus: status, paperMode: true, lastProviderOkAt: providerHealthy ? new Date() : undefined } });
  }
  async persistDecision(lineage: DecisionLineage) {
    if (!this.available || !lineage.governor) return;
    const governor = lineage.governor;
    await db.$transaction(async (tx) => {
      if (lineage.regime) await tx.marketRegimeSnapshot.upsert({ where: { id: lineage.regime.id }, update: {}, create: { id: lineage.regime.id, timestamp: new Date(lineage.regime.timestamp), regime: lineage.regime.regime, confidence: lineage.regime.confidence, metricsJson: json(lineage.regime.metrics), explanation: lineage.regime.explanation } });
      await tx.decisionCycle.upsert({
        where: { id: lineage.id },
        update: { status: lineage.status as never, completedAt: lineage.completedAt ? new Date(lineage.completedAt) : null, regimeSnapshotId: lineage.regime?.id },
        create: { id: lineage.id, mode: lineage.mode, status: lineage.status as never, startedAt: new Date(lineage.startedAt), completedAt: lineage.completedAt ? new Date(lineage.completedAt) : undefined, correlationId: `cycle-${lineage.id}`, regimeSnapshotId: lineage.regime?.id },
      });
      for (const proposal of lineage.proposals) await tx.tradeProposal.upsert({ where: { id: proposal.proposalId }, update: {}, create: { id: proposal.proposalId, cycleId: proposal.cycleId, agentId: proposal.agentId, symbol: proposal.symbol, action: proposal.action, confidence: proposal.confidence, requestedNotionalUsd: proposal.requestedNotionalUsd, stopPrice: proposal.proposedStopPrice, takeProfitPrice: proposal.proposedTakeProfitPrice, horizonMinutes: proposal.timeHorizonMinutes, thesis: proposal.thesis, invalidation: proposal.invalidation, evidenceJson: json(proposal.evidence), dataAsOf: new Date(proposal.dataAsOf), createdAt: new Date(proposal.generatedAt) } });
      for (const [agentId, weight] of Object.entries(governor.allocationSnapshot)) await tx.agentAllocation.upsert({ where: { cycleId_agentId: { cycleId: lineage.id, agentId } }, update: { weight }, create: { cycleId: lineage.id, agentId, weight, maxNotionalUsd: 0, reason: "Deterministic Governor regime/trust allocation" } });
      await tx.governorDecision.upsert({ where: { cycleId: lineage.id }, update: { selectedProposalIdsJson: json(governor.selectedProposalIds), rejectedProposalIdsJson: json(governor.rejectedProposalIds), scoresJson: json(governor.scores), rationale: governor.rationale }, create: { id: governor.governorDecisionId, cycleId: lineage.id, selectedProposalIdsJson: json(governor.selectedProposalIds), rejectedProposalIdsJson: json(governor.rejectedProposalIds), scoresJson: json(governor.scores), rationale: governor.rationale, createdAt: new Date(governor.createdAt) } });
      for (const risk of lineage.riskDecisions) await tx.riskDecision.upsert({ where: { proposalId: risk.proposalId }, update: { decision: risk.decision, approvedNotionalUsd: risk.approvedNotionalUsd, approvedQty: risk.approvedQty, stopPrice: risk.stopPrice, takeProfitPrice: risk.takeProfitPrice, checksJson: json(risk.checks), rejectionCodesJson: json(risk.rejectionCodes) }, create: { id: risk.riskDecisionId, proposalId: risk.proposalId, decision: risk.decision, approvedNotionalUsd: risk.approvedNotionalUsd, approvedQty: risk.approvedQty, stopPrice: risk.stopPrice, takeProfitPrice: risk.takeProfitPrice, checksJson: json(risk.checks), rejectionCodesJson: json(risk.rejectionCodes), createdAt: new Date(risk.createdAt) } });
      for (const record of lineage.auditEvents) await tx.auditEvent.upsert({ where: { id: record.id }, update: {}, create: { id: record.id, cycleId: record.cycleId, agentId: record.agentId, proposalId: record.proposalId, orderId: record.orderId, eventType: record.eventType, severity: record.severity, message: record.message, payloadJson: record.payload === undefined ? undefined : json(record.payload), createdAt: new Date(record.createdAt) } });
    });
  }

  async persistPendingOrder(order: BrokerOrder, proposal: TradeProposal, risk: RiskReview) {
    if (!this.available) throw new Error("Execution is blocked because PostgreSQL is unavailable.");
    await db.executionOrder.create({ data: { id: order.id, proposalId: proposal.proposalId, riskDecisionId: risk.riskDecisionId, clientOrderId: order.clientOrderId, symbol: order.symbol, side: order.side, type: order.type, tif: order.timeInForce, requestedQty: order.qty, requestedNotional: order.notional, status: order.status, filledQty: order.filledQty, submittedAt: order.submittedAt ? new Date(order.submittedAt) : undefined } });
  }

  async updateOrder(order: BrokerOrder, alpacaOrderId?: string) {
    if (!this.available) return;
    await db.executionOrder.update({ where: { id: order.id }, data: { alpacaOrderId, status: order.status, filledQty: order.filledQty, filledAvgPrice: order.filledAvgPrice, submittedAt: order.submittedAt ? new Date(order.submittedAt) : undefined } });
  }
}

export const persistence = new PersistenceService();
