import { RISK_CONSTITUTION as C } from "../constants";
import type { RiskContext, RiskDecision, TradeProposal } from "../types";

const roundMoney = (value: number) => Math.round(value * 100) / 100;

export function evaluateRisk(proposal: TradeProposal, context: RiskContext): RiskDecision {
  const reasons: string[] = [];
  const checks: RiskDecision["checks"] = [];
  const hardFailures: string[] = [];

  const check = (label: string, passed: boolean, value: string, failure?: string) => {
    checks.push({ label, passed, value });
    if (!passed && failure) hardFailures.push(failure);
  };

  check(
    "Fresh market data",
    proposal.marketDataAgeSeconds <= C.maxMarketDataAgeSeconds,
    `${proposal.marketDataAgeSeconds}s old`,
    "Market data is stale.",
  );
  check(
    "Confidence floor",
    proposal.confidence >= C.minConfidence,
    `${Math.round(proposal.confidence * 100)}%`,
    "Proposal confidence is below the constitutional floor.",
  );
  check("Protective stop", proposal.stopLoss !== null && proposal.stopLoss > 0, proposal.stopLoss ? `$${proposal.stopLoss.toFixed(2)}` : "Missing", "A valid stop loss is required.");
  check("Take-profit target", proposal.takeProfit !== null && proposal.takeProfit > 0, proposal.takeProfit ? `$${proposal.takeProfit.toFixed(2)}` : "Missing", "A valid take-profit target is required.");
  check(
    "Daily loss limit",
    context.dailyPnlPct > -C.maxDailyLossPct,
    `${context.dailyPnlPct.toFixed(2)}%`,
    "Maximum daily loss has been reached.",
  );
  check(
    "Portfolio drawdown",
    context.portfolioDrawdownPct < C.maxPortfolioDrawdownPct,
    `${context.portfolioDrawdownPct.toFixed(2)}%`,
    "Maximum portfolio drawdown has been reached.",
  );

  if (hardFailures.length) {
    return { decision: "REJECT", approvedCapital: 0, requestedCapital: proposal.requestedCapital, reasons: hardFailures, checks };
  }

  const maxPositionCapital = Math.max(0, context.equity * (C.maxPositionPct / 100) - proposal.currentPositionValue);
  const maxSectorCapital = Math.max(0, context.equity * (C.maxSectorExposurePct / 100) - context.sectorExposure);
  const maxAgentCapital = Math.max(0, context.equity * (C.maxAgentCapitalPct / 100) - context.agentCapital);
  const stopDistancePct = proposal.stopLoss
    ? Math.abs(proposal.entryPrice - proposal.stopLoss) / proposal.entryPrice
    : 1;
  const maxByTradeRisk = stopDistancePct > 0
    ? (context.equity * (C.maxRiskPerTradePct / 100)) / stopDistancePct
    : 0;
  const permittedCapital = roundMoney(Math.min(
    proposal.requestedCapital,
    maxPositionCapital,
    maxSectorCapital,
    maxAgentCapital,
    maxByTradeRisk,
    context.buyingPower,
  ));

  checks.push(
    { label: "Position concentration", passed: proposal.requestedCapital <= maxPositionCapital, value: `$${roundMoney(maxPositionCapital).toLocaleString()} max` },
    { label: "Sector exposure", passed: proposal.requestedCapital <= maxSectorCapital, value: `$${roundMoney(maxSectorCapital).toLocaleString()} max` },
    { label: "Agent capital", passed: proposal.requestedCapital <= maxAgentCapital, value: `$${roundMoney(maxAgentCapital).toLocaleString()} max` },
    { label: "Risk at stop", passed: proposal.requestedCapital <= maxByTradeRisk, value: `$${roundMoney(maxByTradeRisk).toLocaleString()} max` },
    { label: "Buying power", passed: proposal.requestedCapital <= context.buyingPower, value: `$${roundMoney(context.buyingPower).toLocaleString()} available` },
  );

  if (permittedCapital <= 0) {
    return {
      decision: "REJECT",
      approvedCapital: 0,
      requestedCapital: proposal.requestedCapital,
      reasons: ["No risk capacity remains for this proposal."],
      checks,
    };
  }

  if (permittedCapital < proposal.requestedCapital) {
    reasons.push(`Requested $${proposal.requestedCapital.toLocaleString()}, but the constitution permits at most $${permittedCapital.toLocaleString()}.`);
    if (permittedCapital < proposal.requestedCapital * 0.5) {
      reasons.push("The required reduction is material, so the proposal must be rejected and resubmitted.");
      return { decision: "REJECT", approvedCapital: 0, requestedCapital: proposal.requestedCapital, reasons, checks };
    }
    return { decision: "MODIFY", approvedCapital: permittedCapital, requestedCapital: proposal.requestedCapital, reasons, checks };
  }

  return {
    decision: "APPROVE",
    approvedCapital: permittedCapital,
    requestedCapital: proposal.requestedCapital,
    reasons: ["All constitutional checks passed."],
    checks,
  };
}
