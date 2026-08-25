import type { AgentId } from "./types";

export const RISK_CONSTITUTION = {
  maxRiskPerTradePct: 0.5,
  maxPositionPct: 10,
  maxSectorExposurePct: 30,
  maxAgentCapitalPct: 35,
  maxDailyLossPct: 2,
  maxPortfolioDrawdownPct: 5,
  minConfidence: 0.55,
  maxMarketDataAgeSeconds: 60,
} as const;

export const AGENT_ORDER: AgentId[] = ["momentum", "news", "reversion", "defensive"];

export const WATCHLIST = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD"];
