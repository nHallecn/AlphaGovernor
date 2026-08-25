import { randomUUID } from "node:crypto";
import type { AbstainDecision, AgentStatus, AgentType, GovernorDecision, IndicatorSnapshot, MarketRegime, MarketRegimeSnapshot, NewsAnalysis, TradeProposal } from "@alphagovernor/contracts";

export const AGENT_IDS: Record<AgentType, string> = {
  MOMENTUM: "a1000000-0000-4000-8000-000000000001",
  MEAN_REVERSION: "a1000000-0000-4000-8000-000000000002",
  NEWS: "a1000000-0000-4000-8000-000000000003",
  DEFENSIVE: "a1000000-0000-4000-8000-000000000004",
};

export const REGIME_COMPATIBILITY: Record<AgentType, Record<MarketRegime, number>> = {
  MOMENTUM: { BULL_TREND: 0.95, BEAR_TREND: 0.75, RANGE: 0.30, HIGH_VOL: 0.55, LOW_VOL: 0.70, EVENT_SHOCK: 0.45 },
  MEAN_REVERSION: { BULL_TREND: 0.45, BEAR_TREND: 0.45, RANGE: 0.95, HIGH_VOL: 0.55, LOW_VOL: 0.75, EVENT_SHOCK: 0.30 },
  NEWS: { BULL_TREND: 0.65, BEAR_TREND: 0.65, RANGE: 0.45, HIGH_VOL: 0.75, LOW_VOL: 0.40, EVENT_SHOCK: 1.00 },
  DEFENSIVE: { BULL_TREND: 0.25, BEAR_TREND: 0.95, RANGE: 0.35, HIGH_VOL: 1.00, LOW_VOL: 0.30, EVENT_SHOCK: 0.90 },
};

export interface InstrumentContext { symbol: string; indicators: IndicatorSnapshot; priceAgeSeconds: number }
export interface PortfolioContext { equity: number; cash: number; drawdownPct: number; dayPnlPct: number; positions: Array<{ symbol: string; marketValue: number; qty: number }> }
export interface NewsEvent { id: string; symbol: string; headline: string; summary: string; publishedAt: string }
export interface AgentEvaluationInput { cycleId: string; now: Date; regime: MarketRegimeSnapshot; allocation: { maxNotionalUsd: number }; instruments: InstrumentContext[]; portfolio: PortfolioContext; recentNews: NewsEvent[] }
export type AgentEvaluationResult = { kind: "proposal"; proposal: TradeProposal } | { kind: "abstain"; abstain: AbstainDecision };
export interface TradingAgent { readonly id: string; readonly type: AgentType; evaluate(input: AgentEvaluationInput): Promise<AgentEvaluationResult> }
export interface AiReasoningProvider { analyzeNews(input: { event: NewsEvent; market: InstrumentContext }): Promise<NewsAnalysis>; summarizeProposal(input: TradeProposal): Promise<string>; summarizeGovernorDecision(input: GovernorDecision): Promise<string> }

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const latestTimestamp = (instrument: InstrumentContext) => instrument.indicators.timestamp;
const abstain = (cycleId: string, agentId: string, now: Date, reasonCode: AbstainDecision["reasonCode"], explanation: string, symbol?: string): AgentEvaluationResult => ({ kind: "abstain", abstain: { cycleId, agentId, symbol, reasonCode, explanation, generatedAt: now.toISOString() } });

export class MomentumAgent implements TradingAgent {
  readonly id = AGENT_IDS.MOMENTUM;
  readonly type = "MOMENTUM" as const;
  constructor(private readonly createId: () => string = randomUUID) {}
  async evaluate(input: AgentEvaluationInput): Promise<AgentEvaluationResult> {
    const candidates = input.instruments.filter(({ indicators }) => indicators.ema20 && indicators.ema50 && indicators.rsi14 && indicators.atr14)
      .map((instrument) => {
        const value = instrument.indicators;
        const trend = value.ema20! > value.ema50! ? 1 : 0;
        const rsiScore = value.rsi14! >= 55 && value.rsi14! <= 75 ? 1 : 0;
        const volume = clamp((value.volumeRatio ?? 0) / 1.5);
        const relative = clamp(((value.relativeStrength ?? -1) + 1) / 2);
        return { instrument, score: 0.35 * trend + 0.25 * rsiScore + 0.2 * volume + 0.2 * relative };
      }).sort((a, b) => b.score - a.score);
    const best = candidates[0];
    if (!best || best.score < 0.65) return abstain(input.cycleId, this.id, input.now, "NO_EDGE", "No symbol met the deterministic momentum composite threshold.");
    const { indicators } = best.instrument;
    const requested = Math.min(input.allocation.maxNotionalUsd, input.portfolio.equity * 0.1);
    return { kind: "proposal", proposal: {
      proposalId: this.createId(), cycleId: input.cycleId, agentId: this.id, symbol: best.instrument.symbol, action: "BUY", confidence: clamp(best.score), requestedNotionalUsd: requested,
      timeHorizonMinutes: 240, thesis: "EMA trend, relative strength, RSI, and volume expansion align for a governed momentum entry.", invalidation: "The trend thesis is invalidated below the volatility-adjusted protective stop.",
      evidence: { price: indicators.price, emaFast: indicators.ema20 ?? undefined, emaSlow: indicators.ema50 ?? undefined, rsi14: indicators.rsi14 ?? undefined, atr14: indicators.atr14 ?? undefined, zScore20: indicators.zScore20 ?? undefined, volumeRatio: indicators.volumeRatio ?? undefined, relativeStrength: indicators.relativeStrength ?? undefined, newsEventIds: [], summary: ["EMA20 above EMA50", `RSI ${indicators.rsi14?.toFixed(1)}`, `Volume ${indicators.volumeRatio?.toFixed(2)}x`] },
      proposedStopPrice: indicators.price - 1.5 * indicators.atr14!, proposedTakeProfitPrice: indicators.price + 2.5 * indicators.atr14!, generatedAt: input.now.toISOString(), dataAsOf: latestTimestamp(best.instrument),
    } };
  }
}

export class MeanReversionAgent implements TradingAgent {
  readonly id = AGENT_IDS.MEAN_REVERSION;
  readonly type = "MEAN_REVERSION" as const;
  constructor(private readonly createId: () => string = randomUUID) {}
  async evaluate(input: AgentEvaluationInput): Promise<AgentEvaluationResult> {
    if (!["RANGE", "LOW_VOL"].includes(input.regime.regime)) return abstain(input.cycleId, this.id, input.now, "REGIME_MISMATCH", "Mean Reversion abstained because the active regime is not range-compatible.");
    const best = input.instruments.filter(({ indicators }) => indicators.zScore20 !== null && indicators.rsi14 !== null && indicators.atr14 !== null && indicators.ema20 !== null)
      .map((instrument) => ({ instrument, score: clamp((Math.abs(Math.min(0, instrument.indicators.zScore20!)) - 1.5) / 1.5) * 0.65 + clamp((40 - instrument.indicators.rsi14!) / 20) * 0.35 }))
      .filter(({ instrument }) => instrument.indicators.zScore20! <= -1.75 && instrument.indicators.rsi14! <= 35)
      .sort((a, b) => b.score - a.score)[0];
    if (!best || best.score < 0.65) return abstain(input.cycleId, this.id, input.now, "NO_EDGE", "No liquid watchlist symbol met the deterministic stretch and RSI requirements.");
    const indicators = best.instrument.indicators;
    const target = Math.max(indicators.ema20!, indicators.price + 1.875 * indicators.atr14!);
    return { kind: "proposal", proposal: {
      proposalId: this.createId(), cycleId: input.cycleId, agentId: this.id, symbol: best.instrument.symbol, action: "BUY", confidence: best.score, requestedNotionalUsd: Math.min(input.allocation.maxNotionalUsd, input.portfolio.equity * 0.08), timeHorizonMinutes: 180,
      thesis: "The instrument is statistically stretched in a compatible range regime with oversold confirmation.", invalidation: "The reversion thesis fails if price extends below the ATR-adjusted protective stop.",
      evidence: { price: indicators.price, emaFast: indicators.ema20 ?? undefined, rsi14: indicators.rsi14 ?? undefined, atr14: indicators.atr14 ?? undefined, zScore20: indicators.zScore20 ?? undefined, volumeRatio: indicators.volumeRatio ?? undefined, relativeStrength: indicators.relativeStrength ?? undefined, newsEventIds: [], summary: [`Z-score ${indicators.zScore20?.toFixed(2)}`, `RSI ${indicators.rsi14?.toFixed(1)}`, "Range regime compatible"] },
      proposedStopPrice: indicators.price - 1.25 * indicators.atr14!, proposedTakeProfitPrice: target, generatedAt: input.now.toISOString(), dataAsOf: latestTimestamp(best.instrument),
    } };
  }
}

export class DefensiveAgent implements TradingAgent {
  readonly id = AGENT_IDS.DEFENSIVE;
  readonly type = "DEFENSIVE" as const;
  constructor(private readonly createId: () => string = randomUUID) {}
  async evaluate(input: AgentEvaluationInput): Promise<AgentEvaluationResult> {
    const triggered = input.portfolio.drawdownPct >= 4 || input.portfolio.dayPnlPct <= -1.5 || ["HIGH_VOL", "EVENT_SHOCK"].includes(input.regime.regime);
    const position = [...input.portfolio.positions].sort((a, b) => b.marketValue - a.marketValue)[0];
    if (!triggered || !position) return abstain(input.cycleId, this.id, input.now, "NO_EDGE", "No portfolio protection trigger requires a defensive exit.");
    const instrument = input.instruments.find((item) => item.symbol === position.symbol);
    if (!instrument) return abstain(input.cycleId, this.id, input.now, "STALE_DATA", "Position market context is unavailable for defensive action.", position.symbol);
    return { kind: "proposal", proposal: {
      proposalId: this.createId(), cycleId: input.cycleId, agentId: this.id, symbol: position.symbol, action: "EXIT", confidence: 0.9, requestedNotionalUsd: Math.abs(position.marketValue), timeHorizonMinutes: 5,
      thesis: "Portfolio risk conditions require reducing the largest concentration through the governed exit path.", invalidation: "Defensive intent remains valid until drawdown and volatility return within configured limits.", evidence: { price: instrument.indicators.price, newsEventIds: [], summary: [`Drawdown ${input.portfolio.drawdownPct.toFixed(2)}%`, `Regime ${input.regime.regime}`] }, generatedAt: input.now.toISOString(), dataAsOf: latestTimestamp(instrument),
    } };
  }
}

export class NewsAgent implements TradingAgent {
  readonly id = AGENT_IDS.NEWS;
  readonly type = "NEWS" as const;
  constructor(private readonly provider: AiReasoningProvider, private readonly createId: () => string = randomUUID) {}
  async evaluate(input: AgentEvaluationInput): Promise<AgentEvaluationResult> {
    const event = input.recentNews[0];
    const market = event ? input.instruments.find((item) => item.symbol === event.symbol) : undefined;
    if (!event || !market) return abstain(input.cycleId, this.id, input.now, "NO_MATERIAL_NEWS", "No recent watchlist news has complete market context.");
    try {
      const analysis = await this.provider.analyzeNews({ event, market });
      if (analysis.materiality < 0.7 || analysis.confidence < 0.7 || !["BULLISH", "BEARISH"].includes(analysis.direction)) return abstain(input.cycleId, this.id, input.now, "LOW_CONFIDENCE", "News analysis was not both material and directionally actionable.", event.symbol);
      const atr = market.indicators.atr14;
      if (!atr) return abstain(input.cycleId, this.id, input.now, "INSUFFICIENT_HISTORY", "ATR is required to govern an event-driven proposal.", event.symbol);
      const isBuy = analysis.direction === "BULLISH";
      return { kind: "proposal", proposal: {
        proposalId: this.createId(), cycleId: input.cycleId, agentId: this.id, symbol: event.symbol, action: isBuy ? "BUY" : "SELL", confidence: analysis.confidence, requestedNotionalUsd: Math.min(input.allocation.maxNotionalUsd, input.portfolio.equity * 0.06), timeHorizonMinutes: analysis.horizon === "INTRADAY" ? 240 : 1440,
        thesis: `${analysis.summary} The event passed materiality, confidence, and immediate market-context gates.`, invalidation: `The event thesis is invalidated if price crosses the ATR-based stop or contradictory material news emerges.`,
        evidence: { price: market.indicators.price, atr14: atr, volumeRatio: market.indicators.volumeRatio ?? undefined, newsEventIds: [event.id], summary: analysis.reasons },
        proposedStopPrice: isBuy ? market.indicators.price - 1.5 * atr : market.indicators.price + 1.5 * atr, proposedTakeProfitPrice: isBuy ? market.indicators.price + 2.5 * atr : market.indicators.price - 2.5 * atr, generatedAt: input.now.toISOString(), dataAsOf: latestTimestamp(market),
      } };
    } catch {
      return abstain(input.cycleId, this.id, input.now, "LOW_CONFIDENCE", "AI provider failure or invalid output caused a safe abstention.", event.symbol);
    }
  }
}

export interface TrustComponents { riskAdjustedPerformance: number; calibrationScore: number; currentRegimePerformance: number; drawdownDiscipline: number; executionQuality: number; sampleSize: number }
export function calculateTrustScore(components: TrustComponents): number {
  const observed = 100 * clamp(0.3 * components.riskAdjustedPerformance + 0.2 * components.calibrationScore + 0.2 * components.currentRegimePerformance + 0.15 * components.drawdownDiscipline + 0.15 * components.executionQuality);
  const observedWeight = Math.min(components.sampleSize / 30, 1);
  return 60 * (1 - observedWeight) + observed * observedWeight;
}

export interface AllocationCandidate { agentId: string; type: AgentType; status: AgentStatus; trust: number }
export function allocateAgents(candidates: AllocationCandidate[], regime: MarketRegime, deployableWeight = 0.9, maxWeight = 0.35): Record<string, number> {
  const statusMultiplier: Record<AgentStatus, number> = { ACTIVE: 1, PROBATION: 0.35, SUSPENDED: 0, DISABLED: 0 };
  const raw = candidates.map((candidate) => ({ ...candidate, score: clamp(candidate.trust / 100) * REGIME_COMPATIBILITY[candidate.type][regime] * statusMultiplier[candidate.status] }));
  const result: Record<string, number> = Object.fromEntries(raw.map((item) => [item.agentId, 0]));
  let remaining = deployableWeight;
  let eligible = raw.filter((item) => item.score > 0);
  while (remaining > 0.000001 && eligible.length) {
    const total = eligible.reduce((sum, item) => sum + item.score, 0);
    if (total === 0) break;
    let assigned = 0;
    for (const item of eligible) { const addition = Math.min(maxWeight - (result[item.agentId] ?? 0), remaining * (item.score / total)); result[item.agentId] = (result[item.agentId] ?? 0) + Math.max(0, addition); assigned += Math.max(0, addition); }
    if (assigned <= 0.000001) break;
    remaining -= assigned;
    eligible = eligible.filter((item) => (result[item.agentId] ?? 0) < maxWeight - 0.000001);
  }
  return result;
}

export interface ProposalScoreInput { proposal: TradeProposal; trustScore: number; agentType: AgentType; regime: MarketRegime; freshnessScore: number }
export function scoreProposal(input: ProposalScoreInput) {
  const stop = input.proposal.proposedStopPrice;
  const target = input.proposal.proposedTakeProfitPrice;
  const price = input.proposal.evidence.price;
  const ratio = stop && target ? Math.abs(target - price) / Math.max(0.0001, Math.abs(price - stop)) : 0;
  const rewardRiskScore = clamp(ratio / 3);
  const regimeCompatibility = REGIME_COMPATIBILITY[input.agentType][input.regime];
  const finalScore = 0.3 * (input.trustScore / 100) + 0.25 * regimeCompatibility + 0.25 * input.proposal.confidence + 0.15 * rewardRiskScore + 0.05 * input.freshnessScore;
  return { proposalId: input.proposal.proposalId, trustScore: input.trustScore, regimeCompatibility, confidence: input.proposal.confidence, rewardRiskScore, freshnessScore: input.freshnessScore, finalScore: clamp(finalScore) };
}

export function governProposals(cycleId: string, inputs: ProposalScoreInput[], allocations: Record<string, number>, createId: () => string = randomUUID, now = new Date(), threshold = 0.65, maxOrders = 3): GovernorDecision {
  const scores = inputs.map(scoreProposal).sort((a, b) => b.finalScore - a.finalScore);
  const byProposal = new Map(inputs.map((input) => [input.proposal.proposalId, input.proposal]));
  const selected: string[] = [];
  for (const score of scores) {
    if (score.finalScore < threshold || selected.length >= maxOrders) continue;
    const proposal = byProposal.get(score.proposalId)!;
    const conflict = selected.map((id) => byProposal.get(id)!).find((chosen) => chosen.symbol === proposal.symbol && chosen.action !== proposal.action);
    if (conflict) { const conflictScore = scores.find((item) => item.proposalId === conflict.proposalId)!; if (score.finalScore - conflictScore.finalScore < 0.1) continue; }
    selected.push(score.proposalId);
  }
  return { governorDecisionId: createId(), cycleId, selectedProposalIds: selected, rejectedProposalIds: inputs.map((item) => item.proposal.proposalId).filter((id) => !selected.includes(id)), allocationSnapshot: allocations, scores, rationale: selected.length ? `Selected ${selected.length} proposal(s) above the governed score threshold.` : "No proposal cleared the governed score threshold; holding cash is valid.", createdAt: now.toISOString() };
}
