export type AgentId = "momentum" | "news" | "reversion" | "defensive";
export type AgentStatus = "ACTIVE" | "PROBATION" | "SUSPENDED";
export type EventKind = "system" | "proposal" | "approved" | "veto" | "warning" | "success";

export interface Agent {
  id: AgentId;
  name: string;
  shortName: string;
  mandate: string;
  trust: number;
  previousTrust: number;
  allocation: number;
  pnl: number;
  winRate: number;
  drawdown: number;
  calibration: number;
  compatibility: number;
  status: AgentStatus;
  color: string;
}

export interface Regime {
  label: string;
  confidence: number;
  volatility: "LOW" | "MODERATE" | "HIGH";
  summary: string;
}

export interface DecisionEvent {
  id: string;
  marketTime: string;
  title: string;
  detail: string;
  kind: EventKind;
  agentId?: AgentId;
  symbol?: string;
  amount?: number;
  reasoning?: string[];
}

export interface EquityPoint {
  time: string;
  value: number;
}

export interface SimulationState {
  replayIndex: number;
  marketTime: string;
  portfolioValue: number;
  todayPnl: number;
  todayPnlPct: number;
  drawdown: number;
  cashAllocation: number;
  buyingPower: number;
  regime: Regime;
  agents: Record<AgentId, Agent>;
  timeline: DecisionEvent[];
  equityCurve: EquityPoint[];
  lastDecision: {
    headline: string;
    summary: string;
    reasons: string[];
  };
}

export interface TradeProposal {
  id: string;
  agentId: AgentId;
  symbol: string;
  side: "buy" | "sell";
  confidence: number;
  requestedCapital: number;
  currentPositionValue: number;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  evidence: string[];
  marketDataAgeSeconds: number;
}

export interface RiskContext {
  equity: number;
  buyingPower: number;
  dailyPnlPct: number;
  portfolioDrawdownPct: number;
  agentCapital: number;
  sectorExposure: number;
}

export interface RiskDecision {
  decision: "APPROVE" | "MODIFY" | "REJECT";
  approvedCapital: number;
  requestedCapital: number;
  reasons: string[];
  checks: Array<{ label: string; passed: boolean; value: string }>;
}
