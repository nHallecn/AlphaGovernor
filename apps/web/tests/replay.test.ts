import { describe, expect, it } from "vitest";
import { replayScenario, runReplayThrough } from "@/lib/engine/replay";

describe("market replay", () => {
  it("places the weak agent on probation and reallocates its capital", () => {
    const probationIndex = replayScenario.findIndex((step) => step.event.id === "probation") + 1;
    const state = runReplayThrough(probationIndex);
    expect(state.agents.reversion.status).toBe("PROBATION");
    expect(state.agents.reversion.allocation).toBe(4_500);
    expect(state.cashAllocation).toBe(15);
  });

  it("completes the audit-to-reallocation loop", () => {
    const state = runReplayThrough(replayScenario.length);
    expect(state.agents.momentum.trust).toBe(86);
    expect(state.timeline.at(-1)?.id).toBe("final-reallocate");
    expect(state.lastDecision.headline).toContain("Reward");
  });
});
