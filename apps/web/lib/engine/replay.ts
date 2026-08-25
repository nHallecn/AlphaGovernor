import type { AgentId, DecisionEvent, SimulationState } from "../types";

export type ReplayMutation = {
  event: DecisionEvent;
  portfolioValue?: number;
  todayPnl?: number;
  todayPnlPct?: number;
  drawdown?: number;
  cashAllocation?: number;
  buyingPower?: number;
  regime?: Partial<SimulationState["regime"]>;
  agentChanges?: Partial<Record<AgentId, Partial<SimulationState["agents"][AgentId]>>>;
  decision?: SimulationState["lastDecision"];
};

export const initialState: SimulationState = {
  replayIndex: 0,
  marketTime: "09:28",
  portfolioValue: 100_000,
  todayPnl: 0,
  todayPnlPct: 0,
  drawdown: 0,
  cashAllocation: 20,
  buyingPower: 48_000,
  regime: {
    label: "PRE-MARKET SCAN",
    confidence: 64,
    volatility: "MODERATE",
    summary: "Awaiting the opening range before capital is deployed.",
  },
  agents: {
    momentum: { id: "momentum", name: "Momentum Agent", shortName: "MOM", mandate: "Trend + volume expansion", trust: 81, previousTrust: 81, allocation: 28_000, pnl: 3.1, winRate: 59, drawdown: 1.9, calibration: 78, compatibility: 72, status: "ACTIVE", color: "#adff2f" },
    news: { id: "news", name: "News Intelligence", shortName: "NEWS", mandate: "Material event interpretation", trust: 76, previousTrust: 76, allocation: 20_000, pnl: 1.8, winRate: 55, drawdown: 2.2, calibration: 83, compatibility: 68, status: "ACTIVE", color: "#68d8ff" },
    reversion: { id: "reversion", name: "Mean Reversion", shortName: "MRV", mandate: "Statistical stretch + reversal", trust: 57, previousTrust: 57, allocation: 18_000, pnl: -0.8, winRate: 51, drawdown: 2.7, calibration: 61, compatibility: 42, status: "ACTIVE", color: "#b59cff" },
    defensive: { id: "defensive", name: "Capital Preservation", shortName: "DEF", mandate: "Volatility + drawdown defense", trust: 79, previousTrust: 79, allocation: 14_000, pnl: 0.6, winRate: 64, drawdown: 0.8, calibration: 88, compatibility: 70, status: "ACTIVE", color: "#ffbe5c" },
  },
  timeline: [{ id: "boot", marketTime: "09:28", title: "Command center online", detail: "Risk Constitution locked. Four specialist agents ready.", kind: "system" }],
  equityCurve: [{ time: "09:28", value: 100_000 }],
  lastDecision: {
    headline: "Holding opening reserve",
    summary: "The Governor is waiting for regime confidence before deploying additional capital.",
    reasons: ["Opening range incomplete", "20% cash reserve active", "Risk Constitution locked"],
  },
};

export const replayScenario: ReplayMutation[] = [
  {
    event: { id: "regime", marketTime: "09:30", title: "Trending bull regime detected", detail: "Breadth, EMA structure, and relative strength agree with 82% confidence.", kind: "system", reasoning: ["SPY above 20/50 EMA", "Market breadth 68%", "Volatility moderate"] },
    regime: { label: "TRENDING BULL", confidence: 82, summary: "Trend persistence is strong; favor momentum and event-driven strategies." },
    agentChanges: { momentum: { compatibility: 95, allocation: 34_000 }, news: { compatibility: 80, allocation: 23_000 }, reversion: { compatibility: 30, allocation: 9_000 }, defensive: { compatibility: 70, allocation: 24_000 } },
    cashAllocation: 10,
    decision: { headline: "Increase Momentum allocation", summary: "Capital follows regime fit without weakening the portfolio safety envelope.", reasons: ["Trend persistence increased", "Momentum regime fit: 95%", "10% reserve retained"] },
  },
  {
    event: { id: "proposal-nvda", marketTime: "09:42", title: "Momentum proposes BUY NVDA", detail: "82% confidence · $3,200 requested · stop at $164.20.", kind: "proposal", agentId: "momentum", symbol: "NVDA", amount: 3_200, reasoning: ["Relative strength 0.87", "Volume expansion 1.63×", "20 EMA above 50 EMA"] },
  },
  {
    event: { id: "execute-nvda", marketTime: "09:43", title: "NVDA order approved", detail: "Governor ranked #1. Risk Guardian passed 11/11 checks. Paper order routed.", kind: "approved", agentId: "momentum", symbol: "NVDA", amount: 3_200 },
    buyingPower: 44_800,
    decision: { headline: "Fund Momentum Agent", summary: "The proposal is compatible with the active regime and fits every constitutional limit.", reasons: ["Trust score 81/100", "Proposal confidence 82%", "Risk at stop 0.37%"] },
  },
  {
    event: { id: "risk-veto", marketTime: "09:47", title: "Risk Guardian vetoes TSLA", detail: "$20,000 requested · $8,400 permitted · concentration limit exceeded.", kind: "veto", agentId: "reversion", symbol: "TSLA", amount: 20_000, reasoning: ["Requested position 20.0%", "Constitution limit 10.0%", "AI override disabled"] },
    decision: { headline: "VETO Mean Reversion proposal", summary: "The agent found a signal, but no model can override portfolio concentration policy.", reasons: ["Requested: $20,000", "Permitted: $8,400", "Position limit exceeded"] },
  },
  {
    event: { id: "news-shock", marketTime: "10:18", title: "News Agent detects negative event", detail: "Semiconductor export headline classified material; exposure review opened.", kind: "warning", agentId: "news", symbol: "NVDA", reasoning: ["Materiality 0.88", "Direction negative", "Horizon 1–3 days"] },
    regime: { confidence: 69, volatility: "HIGH", summary: "Event risk is rising; new position sizes are reduced automatically." },
    agentChanges: { news: { trust: 78, previousTrust: 76, compatibility: 92 }, defensive: { compatibility: 84 } },
    decision: { headline: "Tighten the safety envelope", summary: "News risk has risen enough to reduce new sizing and elevate the defensive mandate.", reasons: ["Material event detected", "Volatility moved HIGH", "Stops remain active"] },
  },
  {
    event: { id: "reversion-miss", marketTime: "10:26", title: "High-confidence reversion call fails", detail: "Second calibrated miss in three sessions; loss discipline remained intact.", kind: "warning", agentId: "reversion" },
    portfolioValue: 99_640,
    todayPnl: -360,
    todayPnlPct: -0.36,
    drawdown: 0.58,
    agentChanges: { reversion: { trust: 49, previousTrust: 57, pnl: -2.3, drawdown: 3.4, calibration: 44 } },
  },
  {
    event: { id: "probation", marketTime: "10:27", title: "Mean Reversion placed on probation", detail: "Authority reduced from $9,000 to $4,500. Capital returned to cash.", kind: "veto", agentId: "reversion", amount: 4_500, reasoning: ["Trust fell below 50", "Calibration deteriorated", "Current regime unfavorable"] },
    cashAllocation: 15,
    buyingPower: 49_300,
    agentChanges: { reversion: { status: "PROBATION", allocation: 4_500, compatibility: 22 } },
    decision: { headline: "Place Mean Reversion on probation", summary: "Capital authority is earned. Repeated confident misses trigger an automatic demotion.", reasons: ["Trust 57 → 49", "Regime fit 22%", "$4,500 returned to reserve"] },
  },
  {
    event: { id: "volatility", marketTime: "11:03", title: "Portfolio volatility threshold crossed", detail: "Capital Preservation Agent reallocates 20% to cash.", kind: "system", agentId: "defensive" },
    cashAllocation: 20,
    agentChanges: { defensive: { trust: 82, previousTrust: 79, allocation: 25_000 }, momentum: { allocation: 30_000 }, news: { allocation: 20_500 } },
    decision: { headline: "Raise cash to 20%", summary: "The defensive agent receives temporary authority while the event shock is unresolved.", reasons: ["Volatility threshold crossed", "Cross-agent correlation increased", "Buying power preserved"] },
  },
  {
    event: { id: "nvda-close", marketTime: "12:14", title: "Momentum closes NVDA +2.4%", detail: "Target reached. $76.80 realized with no risk intervention required.", kind: "success", agentId: "momentum", symbol: "NVDA", amount: 3_276.8 },
    portfolioValue: 100_716.8,
    todayPnl: 716.8,
    todayPnlPct: 0.72,
    drawdown: 0.31,
    buyingPower: 52_576.8,
    agentChanges: { momentum: { trust: 86, previousTrust: 81, pnl: 4.8, winRate: 61, calibration: 82 } },
  },
  {
    event: { id: "final-reallocate", marketTime: "12:15", title: "Governor reallocates capital", detail: "Momentum earns +$4,000 authority. Mean Reversion remains on probation.", kind: "approved", agentId: "momentum", amount: 4_000, reasoning: ["Trust 81 → 86", "Regime fit remains favorable", "Defensive reserve retained"] },
    agentChanges: { momentum: { allocation: 34_000 }, news: { allocation: 21_000 }, reversion: { allocation: 4_500 }, defensive: { allocation: 20_500 } },
    decision: { headline: "Reward disciplined performance", summary: "The closed loop is complete: outcome → audit → reputation → capital reallocation.", reasons: ["Momentum trust 86/100", "Reversion stays on probation", "20% cash reserve retained"] },
  },
];

export function applyReplayMutation(state: SimulationState, mutation: ReplayMutation): SimulationState {
  const agents = { ...state.agents };
  if (mutation.agentChanges) {
    for (const [id, changes] of Object.entries(mutation.agentChanges) as [AgentId, Partial<SimulationState["agents"][AgentId]>][]) {
      agents[id] = { ...agents[id], ...changes };
    }
  }
  const portfolioValue = mutation.portfolioValue ?? state.portfolioValue;
  return {
    ...state,
    replayIndex: state.replayIndex + 1,
    marketTime: mutation.event.marketTime,
    portfolioValue,
    todayPnl: mutation.todayPnl ?? state.todayPnl,
    todayPnlPct: mutation.todayPnlPct ?? state.todayPnlPct,
    drawdown: mutation.drawdown ?? state.drawdown,
    cashAllocation: mutation.cashAllocation ?? state.cashAllocation,
    buyingPower: mutation.buyingPower ?? state.buyingPower,
    regime: { ...state.regime, ...mutation.regime },
    agents,
    timeline: [...state.timeline, mutation.event],
    equityCurve: [...state.equityCurve, { time: mutation.event.marketTime, value: portfolioValue }],
    lastDecision: mutation.decision ?? state.lastDecision,
  };
}

export function runReplayThrough(index: number): SimulationState {
  return replayScenario.slice(0, index).reduce(applyReplayMutation, structuredClone(initialState));
}
