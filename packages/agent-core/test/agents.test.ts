import { describe, expect, it } from "vitest";
import type { IndicatorSnapshot, MarketRegimeSnapshot } from "@alphagovernor/contracts";
import { AGENT_IDS, MeanReversionAgent, MomentumAgent, allocateAgents, calculateTrustScore, governProposals, type AgentEvaluationInput } from "../src/index.js";

const uuid = () => "b1000000-0000-4000-8000-000000000001";
const now = new Date("2026-08-25T14:00:00.000Z");
const snapshot = (change: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot => ({ symbol: "NVDA", timestamp: now.toISOString(), price: 170, ema20: 168, ema50: 160, rsi14: 62, atr14: 4, realizedVol20: 0.3, zScore20: 1, volumeRatio: 1.4, relativeStrength: 0.7, ...change });
const regime = (value: MarketRegimeSnapshot["regime"]): MarketRegimeSnapshot => ({ id: "b1000000-0000-4000-8000-000000000010", timestamp: now.toISOString(), regime: value, confidence: 0.82, metrics: {}, explanation: value });
const input = (regimeName: MarketRegimeSnapshot["regime"], indicators = snapshot()): AgentEvaluationInput => ({ cycleId: "b1000000-0000-4000-8000-000000000020", now, regime: regime(regimeName), allocation: { maxNotionalUsd: 10_000 }, instruments: [{ symbol: "NVDA", indicators, priceAgeSeconds: 1 }], portfolio: { equity: 100_000, cash: 50_000, drawdownPct: 0.5, dayPnlPct: 0.1, positions: [] }, recentNews: [] });

describe("strategy agents", () => {
  it("produces a structured momentum proposal", async () => { const result = await new MomentumAgent(uuid).evaluate(input("BULL_TREND")); expect(result.kind).toBe("proposal"); if (result.kind === "proposal") expect(result.proposal.evidence.summary).toContain("EMA20 above EMA50"); });
  it("mean reversion abstains in a strong bull regime", async () => expect((await new MeanReversionAgent(uuid).evaluate(input("BULL_TREND", snapshot({ zScore20: -2, rsi14: 30 })))).kind).toBe("abstain"));
  it("mean reversion proposes in a range regime", async () => expect((await new MeanReversionAgent(uuid).evaluate(input("RANGE", snapshot({ zScore20: -2.5, rsi14: 28 })))).kind).toBe("proposal"));
});

describe("Governor", () => {
  it("cold-start blends observed trust with a neutral prior", () => { expect(calculateTrustScore({ riskAdjustedPerformance: 1, calibrationScore: 1, currentRegimePerformance: 1, drawdownDiscipline: 1, executionQuality: 1, sampleSize: 0 })).toBe(60); expect(calculateTrustScore({ riskAdjustedPerformance: 1, calibrationScore: 1, currentRegimePerformance: 1, drawdownDiscipline: 1, executionQuality: 1, sampleSize: 30 })).toBe(100); });
  it("caps allocations and penalizes probation", () => { const allocations = allocateAgents([{ agentId: AGENT_IDS.MOMENTUM, type: "MOMENTUM", status: "ACTIVE", trust: 80 }, { agentId: AGENT_IDS.MEAN_REVERSION, type: "MEAN_REVERSION", status: "PROBATION", trust: 80 }], "BULL_TREND"); expect(allocations[AGENT_IDS.MOMENTUM]).toBeLessThanOrEqual(0.35); expect(allocations[AGENT_IDS.MEAN_REVERSION]).toBeLessThan(allocations[AGENT_IDS.MOMENTUM]!); });
  it("selects the higher-trust regime-fit proposal", async () => { const momentum = await new MomentumAgent(uuid).evaluate(input("BULL_TREND")); if (momentum.kind !== "proposal") throw new Error("fixture failed"); const decision = governProposals(input("BULL_TREND").cycleId, [{ proposal: momentum.proposal, trustScore: 90, agentType: "MOMENTUM", regime: "BULL_TREND", freshnessScore: 1 }], { [AGENT_IDS.MOMENTUM]: 0.35 }, uuid, now); expect(decision.selectedProposalIds).toEqual([momentum.proposal.proposalId]); });
});
