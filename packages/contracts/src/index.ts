import { z } from "zod";

export const AgentTypeSchema = z.enum(["MOMENTUM", "MEAN_REVERSION", "NEWS", "DEFENSIVE"]);
export const AgentStatusSchema = z.enum(["ACTIVE", "PROBATION", "SUSPENDED", "DISABLED"]);
export const MarketRegimeSchema = z.enum(["BULL_TREND", "BEAR_TREND", "RANGE", "HIGH_VOL", "LOW_VOL", "EVENT_SHOCK"]);
export const ProposalActionSchema = z.enum(["BUY", "SELL", "EXIT", "HOLD"]);
export const RiskDecisionTypeSchema = z.enum(["APPROVE", "RESIZE", "REJECT"]);
export const DecisionCycleStatusSchema = z.enum(["CREATED", "DATA_READY", "AGENTS_COMPLETE", "GOVERNED", "RISK_REVIEWED", "EXECUTED", "COMPLETED", "FAILED", "CANCELLED"]);
export const SystemTradingStatusSchema = z.enum(["RUNNING", "PAUSED", "RISK_OFF"]);
export const DecisionModeSchema = z.enum(["LIVE_PAPER", "REPLAY"]);

export type AgentType = z.infer<typeof AgentTypeSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type MarketRegime = z.infer<typeof MarketRegimeSchema>;
export type ProposalAction = z.infer<typeof ProposalActionSchema>;
export type RiskDecisionType = z.infer<typeof RiskDecisionTypeSchema>;
export type DecisionCycleStatus = z.infer<typeof DecisionCycleStatusSchema>;
export type SystemTradingStatus = z.infer<typeof SystemTradingStatusSchema>;
export type DecisionMode = z.infer<typeof DecisionModeSchema>;

export const EvidenceSchema = z.object({
  price: z.number().positive(),
  emaFast: z.number().optional(),
  emaSlow: z.number().optional(),
  rsi14: z.number().optional(),
  atr14: z.number().optional(),
  zScore20: z.number().optional(),
  volumeRatio: z.number().optional(),
  relativeStrength: z.number().optional(),
  newsEventIds: z.array(z.uuid()).default([]),
  summary: z.array(z.string()).max(8),
});

export const TradeProposalSchema = z.object({
  proposalId: z.uuid(),
  cycleId: z.uuid(),
  agentId: z.uuid(),
  symbol: z.string().min(1).max(12).regex(/^[A-Z.]+$/),
  action: z.enum(["BUY", "SELL", "EXIT"]),
  confidence: z.number().min(0).max(1),
  requestedNotionalUsd: z.number().positive(),
  timeHorizonMinutes: z.number().int().positive().max(10080),
  thesis: z.string().min(20).max(1200),
  invalidation: z.string().min(10).max(600),
  evidence: EvidenceSchema,
  proposedStopPrice: z.number().positive().optional(),
  proposedTakeProfitPrice: z.number().positive().optional(),
  generatedAt: z.iso.datetime(),
  dataAsOf: z.iso.datetime(),
});
export type TradeProposal = z.infer<typeof TradeProposalSchema>;

export const AbstainDecisionSchema = z.object({
  cycleId: z.uuid(),
  agentId: z.uuid(),
  symbol: z.string().optional(),
  reasonCode: z.enum(["NO_EDGE", "LOW_CONFIDENCE", "STALE_DATA", "REGIME_MISMATCH", "RISK_TOO_HIGH", "INSUFFICIENT_HISTORY", "NO_MATERIAL_NEWS"]),
  explanation: z.string().max(500),
  generatedAt: z.iso.datetime(),
});
export type AbstainDecision = z.infer<typeof AbstainDecisionSchema>;

export const GovernorDecisionSchema = z.object({
  governorDecisionId: z.uuid(),
  cycleId: z.uuid(),
  selectedProposalIds: z.array(z.uuid()),
  rejectedProposalIds: z.array(z.uuid()),
  allocationSnapshot: z.record(z.uuid(), z.number().min(0).max(1)),
  scores: z.array(z.object({
    proposalId: z.uuid(), trustScore: z.number().min(0).max(100), regimeCompatibility: z.number().min(0).max(1),
    confidence: z.number().min(0).max(1), rewardRiskScore: z.number().min(0).max(1), freshnessScore: z.number().min(0).max(1), finalScore: z.number().min(0).max(1),
  })),
  rationale: z.string().max(1500),
  createdAt: z.iso.datetime(),
});
export type GovernorDecision = z.infer<typeof GovernorDecisionSchema>;

export const RiskCheckSchema = z.object({ code: z.string(), passed: z.boolean(), observed: z.string(), limit: z.string(), note: z.string().optional() });
export type RiskCheck = z.infer<typeof RiskCheckSchema>;
export const RiskReviewSchema = z.object({
  riskDecisionId: z.uuid(), proposalId: z.uuid(), decision: RiskDecisionTypeSchema,
  approvedNotionalUsd: z.number().nonnegative(), approvedQty: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(), takeProfitPrice: z.number().positive().optional(),
  checks: z.array(RiskCheckSchema), rejectionCodes: z.array(z.string()), createdAt: z.iso.datetime(),
});
export type RiskReview = z.infer<typeof RiskReviewSchema>;

export const MarketBarSchema = z.object({
  symbol: z.string(), timestamp: z.iso.datetime(), open: z.number().positive(), high: z.number().positive(), low: z.number().positive(), close: z.number().positive(), volume: z.number().nonnegative(), vwap: z.number().positive().optional(),
});
export type MarketBar = z.infer<typeof MarketBarSchema>;

export const IndicatorSnapshotSchema = z.object({
  symbol: z.string(), timestamp: z.iso.datetime(), price: z.number().positive(), ema20: z.number().nullable(), ema50: z.number().nullable(), rsi14: z.number().nullable(), atr14: z.number().nullable(), realizedVol20: z.number().nullable(), zScore20: z.number().nullable(), volumeRatio: z.number().nullable(), relativeStrength: z.number().nullable(),
});
export type IndicatorSnapshot = z.infer<typeof IndicatorSnapshotSchema>;

export const MarketRegimeSnapshotSchema = z.object({
  id: z.uuid(), timestamp: z.iso.datetime(), regime: MarketRegimeSchema, confidence: z.number().min(0.5).max(0.99), metrics: z.record(z.string(), z.number()), explanation: z.string(),
});
export type MarketRegimeSnapshot = z.infer<typeof MarketRegimeSnapshotSchema>;

export const AgentCardSchema = z.object({
  id: z.uuid(), type: AgentTypeSchema, name: z.string(), status: AgentStatusSchema, description: z.string(), trustScore: z.number().min(0).max(100), allocationWeight: z.number().min(0).max(1), maxNotionalUsd: z.number().nonnegative(), pnlPct: z.number(), winRate: z.number().min(0).max(1), maxDrawdownPct: z.number().min(0), calibrationScore: z.number().min(0).max(1), regimeCompatibility: z.number().min(0).max(1), sampleSize: z.number().int().nonnegative(), mostRecentAction: z.string(), source: z.enum(["REPLAY", "PAPER_LIVE", "MIXED"]),
});
export type AgentCard = z.infer<typeof AgentCardSchema>;

export const BrokerAccountSchema = z.object({
  equity: z.number().nonnegative(), cash: z.number(), buyingPower: z.number().nonnegative(), portfolioValue: z.number().nonnegative(), previousEquity: z.number().nonnegative(), daytradeCount: z.number().int().nonnegative(), tradingBlocked: z.boolean(), timestamp: z.iso.datetime(),
});
export type BrokerAccount = z.infer<typeof BrokerAccountSchema>;

export const BrokerPositionSchema = z.object({ symbol: z.string(), qty: z.number(), avgEntryPrice: z.number(), marketValue: z.number(), costBasis: z.number(), unrealizedPl: z.number(), unrealizedPlPct: z.number(), currentPrice: z.number(), originatingAgentId: z.uuid().optional() });
export type BrokerPosition = z.infer<typeof BrokerPositionSchema>;

export const BrokerOrderSchema = z.object({ id: z.string(), clientOrderId: z.string(), symbol: z.string(), side: z.enum(["buy", "sell"]), type: z.string(), timeInForce: z.string(), status: z.string(), qty: z.number().optional(), notional: z.number().optional(), filledQty: z.number(), filledAvgPrice: z.number().optional(), submittedAt: z.iso.datetime().optional(), updatedAt: z.iso.datetime() });
export type BrokerOrder = z.infer<typeof BrokerOrderSchema>;

export const NewsAnalysisSchema = z.object({
  eventId: z.uuid(), symbol: z.string(), category: z.enum(["EARNINGS", "GUIDANCE", "M_AND_A", "PRODUCT", "REGULATORY", "LEGAL", "MACRO", "ANALYST", "MANAGEMENT", "OTHER"]), direction: z.enum(["BULLISH", "BEARISH", "MIXED", "NEUTRAL"]), materiality: z.number().min(0).max(1), confidence: z.number().min(0).max(1), horizon: z.enum(["INTRADAY", "ONE_TO_THREE_DAYS", "MULTIDAY"]), summary: z.string().max(500), reasons: z.array(z.string()).max(6), risks: z.array(z.string()).max(6),
});
export type NewsAnalysis = z.infer<typeof NewsAnalysisSchema>;

export const RealtimeEnvelopeSchema = z.object({ v: z.literal(1), type: z.string(), id: z.string(), timestamp: z.iso.datetime(), correlationId: z.string().optional(), data: z.unknown() });
export type RealtimeEnvelope<T = unknown> = Omit<z.infer<typeof RealtimeEnvelopeSchema>, "data"> & { data: T };

export type ApiSuccess<T> = { data: T; meta?: Record<string, unknown> };
export type ApiFailure = { error: { code: string; message: string; details?: unknown; correlationId: string } };
export const success = <T>(data: T, meta?: Record<string, unknown>): ApiSuccess<T> => meta ? { data, meta } : { data };

export const IdParamSchema = z.object({ id: z.uuid() });
export const PaginationSchema = z.object({ cursor: z.string().optional(), limit: z.coerce.number().int().min(1).max(100).default(25) });
