import { randomUUID } from "node:crypto";
import type { RiskCheck, RiskReview, SystemTradingStatus, TradeProposal } from "@alphagovernor/contracts";
import { DEFAULT_RISK_LIMITS, type RiskLimits } from "@alphagovernor/config";

export interface RiskContext {
  paperMode: boolean;
  systemStatus: SystemTradingStatus;
  marketOpen: boolean;
  accountFreshnessSeconds: number;
  positionFreshnessSeconds: number;
  priceFreshnessSeconds: number;
  symbolEnabled: boolean;
  symbolTradable: boolean;
  equity: number;
  buyingPower: number;
  dayPnlPct: number;
  portfolioDrawdownPct: number;
  currentPrice: number;
  currentSymbolExposureUsd: number;
  agentBudgetUsd: number;
  agentCurrentExposureUsd: number;
  openPositionCount: number;
  openEntryOrderForSymbol: boolean;
  ordersInCycle: number;
  rewardRiskRatio?: number;
}

const cents = (value: number): number => Math.floor(Math.max(0, value) * 100) / 100;

export function reviewProposal(
  proposal: TradeProposal,
  context: RiskContext,
  limits: RiskLimits = DEFAULT_RISK_LIMITS,
  createId: () => string = randomUUID,
  now: Date = new Date(),
): RiskReview {
  const checks: RiskCheck[] = [];
  const rejectionCodes: string[] = [];
  const isExit = proposal.action === "EXIT";
  const addCheck = (code: string, passed: boolean, observed: string, limit: string, note?: string) => {
    checks.push({ code, passed, observed, limit, note });
    if (!passed) rejectionCodes.push(code);
  };

  addCheck("PAPER_MODE", context.paperMode, String(context.paperMode), "true");
  addCheck("SYSTEM_STATUS", context.systemStatus === "RUNNING" || isExit, context.systemStatus, isExit ? "EXIT allowed" : "RUNNING");
  addCheck("MARKET_CLOCK", context.marketOpen || isExit, String(context.marketOpen), isExit ? "EXIT allowed" : "regular hours");
  addCheck("ACCOUNT_FRESH", context.accountFreshnessSeconds <= limits.maxAccountAgeSeconds, `${context.accountFreshnessSeconds}s`, `<=${limits.maxAccountAgeSeconds}s`);
  addCheck("POSITIONS_FRESH", context.positionFreshnessSeconds <= limits.maxPositionAgeSeconds, `${context.positionFreshnessSeconds}s`, `<=${limits.maxPositionAgeSeconds}s`);
  addCheck("PRICE_FRESH", context.priceFreshnessSeconds <= limits.maxPriceAgeSeconds, `${context.priceFreshnessSeconds}s`, `<=${limits.maxPriceAgeSeconds}s`);
  addCheck("SYMBOL_UNIVERSE", context.symbolEnabled, proposal.symbol, "enabled watchlist symbol");
  addCheck("SYMBOL_TRADABLE", context.symbolTradable, String(context.symbolTradable), "true");
  addCheck("CONFIDENCE", isExit || proposal.confidence >= limits.minProposalConfidence, proposal.confidence.toFixed(2), `>=${limits.minProposalConfidence}`);
  addCheck("DAILY_LOSS", isExit || context.dayPnlPct > -limits.maxDailyLossPct, `${context.dayPnlPct.toFixed(2)}%`, `>${-limits.maxDailyLossPct}%`, isExit ? "Defensive exits remain allowed." : undefined);
  addCheck("DRAWDOWN", isExit || context.portfolioDrawdownPct < limits.maxPortfolioDrawdownPct, `${context.portfolioDrawdownPct.toFixed(2)}%`, `<${limits.maxPortfolioDrawdownPct}%`, isExit ? "Defensive exits remain allowed." : undefined);
  addCheck("MAX_POSITIONS", isExit || context.currentSymbolExposureUsd > 0 || context.openPositionCount < limits.maxOpenPositions, String(context.openPositionCount), `<${limits.maxOpenPositions}`);
  addCheck("DUPLICATE_ORDER", isExit || !context.openEntryOrderForSymbol, String(context.openEntryOrderForSymbol), "false");
  addCheck("ORDERS_PER_CYCLE", isExit || context.ordersInCycle < limits.maxOrdersPerCycle, String(context.ordersInCycle), `<${limits.maxOrdersPerCycle}`);

  const stop = proposal.proposedStopPrice;
  const target = proposal.proposedTakeProfitPrice;
  addCheck("PROTECTIVE_STOP", isExit || Boolean(stop && stop > 0), stop ? String(stop) : "missing", isExit ? "not required" : "required");
  addCheck("TAKE_PROFIT", isExit || Boolean(target && target > 0), target ? String(target) : "missing", isExit ? "not required" : "required");
  if (!isExit) addCheck("REWARD_RISK", (context.rewardRiskRatio ?? 0) >= limits.minRewardRisk, (context.rewardRiskRatio ?? 0).toFixed(2), `>=${limits.minRewardRisk}`);

  if (rejectionCodes.length > 0) {
    return { riskDecisionId: createId(), proposalId: proposal.proposalId, decision: "REJECT", approvedNotionalUsd: 0, stopPrice: stop, takeProfitPrice: target, checks, rejectionCodes, createdAt: now.toISOString() };
  }

  if (isExit) {
    const approved = cents(Math.min(proposal.requestedNotionalUsd, Math.abs(context.currentSymbolExposureUsd)));
    return { riskDecisionId: createId(), proposalId: proposal.proposalId, decision: approved < proposal.requestedNotionalUsd ? "RESIZE" : "APPROVE", approvedNotionalUsd: approved, approvedQty: approved / context.currentPrice, checks, rejectionCodes: [], createdAt: now.toISOString() };
  }

  const maxRiskDollars = context.equity * (limits.riskPerTradePct / 100);
  const riskPerShare = Math.abs(context.currentPrice - (stop ?? context.currentPrice));
  const notionalByStopRisk = riskPerShare > 0 ? (maxRiskDollars / riskPerShare) * context.currentPrice : 0;
  const maxPositionRemaining = Math.max(0, context.equity * (limits.maxPositionPct / 100) - context.currentSymbolExposureUsd);
  const maxAgentRemaining = Math.max(0, context.agentBudgetUsd - context.agentCurrentExposureUsd);
  const maxBuyingPower = Math.max(0, context.buyingPower * limits.buyingPowerSafetyFactor);
  const approvedNotionalUsd = cents(Math.min(proposal.requestedNotionalUsd, notionalByStopRisk, maxPositionRemaining, maxAgentRemaining, maxBuyingPower));
  addCheck("STOP_RISK_SIZE", proposal.requestedNotionalUsd <= notionalByStopRisk, `$${proposal.requestedNotionalUsd.toFixed(2)}`, `$${cents(notionalByStopRisk).toFixed(2)}`);
  addCheck("MAX_POSITION", proposal.requestedNotionalUsd <= maxPositionRemaining, `$${proposal.requestedNotionalUsd.toFixed(2)}`, `$${cents(maxPositionRemaining).toFixed(2)}`);
  addCheck("AGENT_BUDGET", proposal.requestedNotionalUsd <= maxAgentRemaining, `$${proposal.requestedNotionalUsd.toFixed(2)}`, `$${cents(maxAgentRemaining).toFixed(2)}`);
  addCheck("BUYING_POWER", proposal.requestedNotionalUsd <= maxBuyingPower, `$${proposal.requestedNotionalUsd.toFixed(2)}`, `$${cents(maxBuyingPower).toFixed(2)}`);
  if (approvedNotionalUsd < limits.minimumNotionalUsd) {
    rejectionCodes.push("MIN_NOTIONAL");
    checks.push({ code: "MIN_NOTIONAL", passed: false, observed: `$${approvedNotionalUsd.toFixed(2)}`, limit: `>= $${limits.minimumNotionalUsd.toFixed(2)}` });
    return { riskDecisionId: createId(), proposalId: proposal.proposalId, decision: "REJECT", approvedNotionalUsd: 0, stopPrice: stop, takeProfitPrice: target, checks, rejectionCodes, createdAt: now.toISOString() };
  }
  return {
    riskDecisionId: createId(), proposalId: proposal.proposalId,
    decision: approvedNotionalUsd < proposal.requestedNotionalUsd ? "RESIZE" : "APPROVE",
    approvedNotionalUsd, approvedQty: approvedNotionalUsd / context.currentPrice,
    stopPrice: stop, takeProfitPrice: target, checks, rejectionCodes: [], createdAt: now.toISOString(),
  };
}
