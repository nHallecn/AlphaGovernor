import type { Agent, AgentId } from "../types";

export interface AllocationInput {
  id: AgentId;
  trust: number;
  regimeCompatibility: number;
  proposalConfidence: number;
}

export function allocationScore(input: AllocationInput): number {
  return (input.trust / 100) * input.regimeCompatibility * input.proposalConfidence;
}

export function allocateCapital(
  inputs: AllocationInput[],
  deployablePct = 90,
  maxAgentPct = 35,
): Record<AgentId, number> {
  const scores = inputs.map((item) => ({ id: item.id, score: allocationScore(item) }));
  const total = scores.reduce((sum, item) => sum + item.score, 0);
  const result = {} as Record<AgentId, number>;

  for (const item of scores) {
    result[item.id] = total === 0 ? 0 : Math.min(maxAgentPct, (item.score / total) * deployablePct);
  }

  let assigned = Object.values(result).reduce((sum, value) => sum + value, 0);
  let remaining = deployablePct - assigned;
  while (remaining > 0.001) {
    const eligible = scores.filter(({ id }) => result[id] < maxAgentPct - 0.001);
    if (!eligible.length) break;
    const eligibleTotal = eligible.reduce((sum, item) => sum + item.score, 0);
    if (eligibleTotal === 0) break;
    for (const item of eligible) {
      const addition = Math.min(maxAgentPct - result[item.id], remaining * (item.score / eligibleTotal));
      result[item.id] += addition;
      assigned += addition;
    }
    remaining = deployablePct - assigned;
  }

  return result;
}

export function trustDirection(agent: Agent): "up" | "down" | "flat" {
  if (agent.trust > agent.previousTrust) return "up";
  if (agent.trust < agent.previousTrust) return "down";
  return "flat";
}
