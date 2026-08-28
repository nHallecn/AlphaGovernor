import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { AgentCard, BrokerAccount, BrokerOrder, BrokerPosition, GovernorDecision, MarketRegimeSnapshot, RealtimeEnvelope, RiskReview, SystemTradingStatus, TradeProposal } from "@alphagovernor/contracts";
import { AGENT_IDS } from "@alphagovernor/agent-core";

export interface AuditRecord { id: string; cycleId?: string; agentId?: string; proposalId?: string; orderId?: string; eventType: string; severity: "INFO" | "WARN" | "ERROR" | "CRITICAL"; message: string; payload?: unknown; createdAt: string }
export interface DecisionLineage {
  id: string;
  mode: "LIVE_PAPER" | "REPLAY";
  status: string;
  startedAt: string;
  completedAt?: string;
  regime?: MarketRegimeSnapshot;
  proposals: TradeProposal[];
  abstentions: unknown[];
  governor?: GovernorDecision;
  riskDecisions: RiskReview[];
  orders: BrokerOrder[];
  auditEvents: AuditRecord[];
}
export interface ReplayRecord { id: string; name: string; status: "CREATED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "STOPPED"; startTime: string; endTime: string; speed: number; symbols: string[]; seed: number; progress: number; createdAt: string; summary?: unknown }

const now = () => new Date().toISOString();
const agents: AgentCard[] = [
  { id: AGENT_IDS.MOMENTUM, type: "MOMENTUM", name: "Momentum", status: "ACTIVE", description: "Trend + volume + relative strength", trustScore: 84, allocationWeight: 0.31, maxNotionalUsd: 31_000, pnlPct: 4.8, winRate: 0.61, maxDrawdownPct: 1.9, calibrationScore: 0.79, regimeCompatibility: 0.95, sampleSize: 18, mostRecentAction: "BUY NVDA", source: "MIXED" },
  { id: AGENT_IDS.NEWS, type: "NEWS", name: "News Intelligence", status: "ACTIVE", description: "Material event interpretation", trustScore: 78, allocationWeight: 0.23, maxNotionalUsd: 23_000, pnlPct: 1.8, winRate: 0.55, maxDrawdownPct: 2.2, calibrationScore: 0.83, regimeCompatibility: 0.8, sampleSize: 11, mostRecentAction: "ABSTAIN", source: "MIXED" },
  { id: AGENT_IDS.MEAN_REVERSION, type: "MEAN_REVERSION", name: "Mean Reversion", status: "PROBATION", description: "Range-regime statistical stretch", trustScore: 44, allocationWeight: 0.08, maxNotionalUsd: 8_000, pnlPct: -2.3, winRate: 0.47, maxDrawdownPct: 3.4, calibrationScore: 0.44, regimeCompatibility: 0.3, sampleSize: 15, mostRecentAction: "PROBATION", source: "MIXED" },
  { id: AGENT_IDS.DEFENSIVE, type: "DEFENSIVE", name: "Capital Preservation", status: "ACTIVE", description: "Portfolio protection + risk-off", trustScore: 73, allocationWeight: 0.18, maxNotionalUsd: 18_000, pnlPct: 0.6, winRate: 0.64, maxDrawdownPct: 0.8, calibrationScore: 0.88, regimeCompatibility: 0.7, sampleSize: 12, mostRecentAction: "HOLD CASH", source: "MIXED" },
];

export class RuntimeState {
  readonly events = new EventEmitter();
  readonly startedAt = Date.now();
  tradingStatus: SystemTradingStatus = "PAUSED";
  account: BrokerAccount = { equity: 103_482, cash: 20_696.4, buyingPower: 42_100, portfolioValue: 103_482, previousEquity: 101_661, daytradeCount: 1, tradingBlocked: false, timestamp: now() };
  positions: BrokerPosition[] = [
    { symbol: "NVDA", qty: 18, avgEntryPrice: 168.2, currentPrice: 172.24, marketValue: 3_100.32, costBasis: 3_027.6, unrealizedPl: 72.72, unrealizedPlPct: 2.4, originatingAgentId: AGENT_IDS.MOMENTUM },
    { symbol: "MSFT", qty: 8, avgEntryPrice: 504.1, currentPrice: 507.9, marketValue: 4_063.2, costBasis: 4_032.8, unrealizedPl: 30.4, unrealizedPlPct: 0.75, originatingAgentId: AGENT_IDS.NEWS },
  ];
  orders: BrokerOrder[] = [];
  agents: AgentCard[] = structuredClone(agents);
  decisions: DecisionLineage[] = [];
  audit: AuditRecord[] = [];
  replays: ReplayRecord[] = [];
  regime: MarketRegimeSnapshot = { id: randomUUID(), timestamp: now(), regime: "BULL_TREND", confidence: 0.82, metrics: { trendScore: 0.78, breadth: 0.68, volPercentile: 0.48, shockScore: 0.12 }, explanation: "Trend and breadth are aligned while volatility remains moderate." };
  riskProfile = { riskPerTradePct: 0.5, maxPositionPct: 10, maxAgentAllocationPct: 35, maxSectorExposurePct: 30, maxDailyLossPct: 2, maxPortfolioDrawdownPct: 5, minCashReservePct: 10, minRewardRisk: 1.5, maxOpenPositions: 8, maxOrdersPerCycle: 3, minProposalConfidence: 0.65 };
  providerHealth = { database: "unknown", redis: "unknown", alpacaRest: "demo", alpacaStream: "disabled", ai: "optional", lastAccountSync: this.account.timestamp, lastPositionSync: now() };

  emit<T>(type: string, data: T, correlationId?: string) {
    const envelope: RealtimeEnvelope<T> = { v: 1, type, id: randomUUID(), timestamp: now(), correlationId, data };
    this.events.emit("event", envelope);
    return envelope;
  }
  appendAudit(input: Omit<AuditRecord, "id" | "createdAt">) {
    const record: AuditRecord = { id: randomUUID(), createdAt: now(), ...input };
    this.audit.unshift(record);
    const cycle = input.cycleId ? this.decisions.find((item) => item.id === input.cycleId) : undefined;
    if (cycle) cycle.auditEvents.unshift(record);
    this.emit("audit.created", record, input.cycleId);
    return record;
  }
  updateTradingStatus(status: SystemTradingStatus, reason: string) {
    this.tradingStatus = status;
    const record = this.appendAudit({ eventType: "system.status", severity: status === "RUNNING" ? "INFO" : "WARN", message: reason, payload: { status } });
    this.emit("system.status", { tradingStatus: status, reason });
    return record;
  }
}

export const runtime = new RuntimeState();
