import { describe, expect, it } from "vitest";
import { allocateCapital, allocationScore } from "@/lib/engine/governor";

describe("Governor allocation", () => {
  const inputs = [
    { id: "momentum" as const, trust: 88, regimeCompatibility: 0.95, proposalConfidence: 0.86 },
    { id: "news" as const, trust: 74, regimeCompatibility: 0.8, proposalConfidence: 0.77 },
    { id: "reversion" as const, trust: 62, regimeCompatibility: 0.3, proposalConfidence: 0.7 },
    { id: "defensive" as const, trust: 81, regimeCompatibility: 0.7, proposalConfidence: 0.8 },
  ];

  it("combines trust, regime compatibility, and proposal confidence", () => {
    expect(allocationScore(inputs[0])).toBeCloseTo(0.71896);
  });

  it("allocates the deployable budget without breaching the per-agent cap", () => {
    const allocations = allocateCapital(inputs);
    expect(Object.values(allocations).reduce((a, b) => a + b, 0)).toBeCloseTo(90);
    expect(Math.max(...Object.values(allocations))).toBeLessThanOrEqual(35);
    expect(allocations.momentum).toBeGreaterThan(allocations.reversion);
  });
});
