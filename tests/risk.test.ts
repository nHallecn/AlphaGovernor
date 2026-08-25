import { describe, expect, it } from "vitest";
import { evaluateRisk } from "@/lib/engine/risk";
import type { RiskContext, TradeProposal } from "@/lib/types";

const proposal: TradeProposal = {
  id: "test-1", agentId: "momentum", symbol: "NVDA", side: "buy", confidence: 0.82,
  requestedCapital: 3_200, currentPositionValue: 0, entryPrice: 168, stopLoss: 164.2,
  takeProfit: 177.5, evidence: ["Trend", "Volume"], marketDataAgeSeconds: 8,
};

const context: RiskContext = {
  equity: 100_000, buyingPower: 50_000, dailyPnlPct: 0.3, portfolioDrawdownPct: 0.8,
  agentCapital: 28_000, sectorExposure: 10_000,
};

describe("Risk Constitution", () => {
  it("approves a fully compliant proposal", () => {
    const decision = evaluateRisk(proposal, context);
    expect(decision.decision).toBe("APPROVE");
    expect(decision.approvedCapital).toBe(3_200);
    expect(decision.checks.every((check) => check.passed)).toBe(true);
  });

  it("rejects a proposal without a protective stop", () => {
    const decision = evaluateRisk({ ...proposal, stopLoss: null }, context);
    expect(decision.decision).toBe("REJECT");
    expect(decision.reasons).toContain("A valid stop loss is required.");
  });

  it("rejects a materially oversized position", () => {
    const decision = evaluateRisk({ ...proposal, requestedCapital: 20_000 }, { ...context, equity: 84_000, agentCapital: 0, sectorExposure: 0 });
    expect(decision.decision).toBe("REJECT");
    expect(decision.reasons.join(" ")).toContain("$8,400");
  });

  it("modifies a proposal when a modest deterministic clamp is sufficient", () => {
    const decision = evaluateRisk({ ...proposal, requestedCapital: 9_000 }, { ...context, equity: 100_000, agentCapital: 28_000 });
    expect(decision.decision).toBe("MODIFY");
    expect(decision.approvedCapital).toBe(7_000);
  });

  it("halts new trades after the daily loss limit", () => {
    const decision = evaluateRisk(proposal, { ...context, dailyPnlPct: -2 });
    expect(decision.decision).toBe("REJECT");
  });
});
