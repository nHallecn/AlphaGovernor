import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

export const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.url().default("http://localhost:3000"),
  API_BASE_URL: z.url().default("http://localhost:4000"),
  DATABASE_URL: z.string().min(1).default("postgresql://postgres:postgres@localhost:5432/alphagovernor"),
  REDIS_URL: z.url().default("redis://localhost:6379"),
  OPERATOR_TOKEN: z.string().min(8).default("change-me-before-deploying"),
  DEMO_MODE: booleanString.default("true"),
  ALPACA_API_KEY: z.string().default(""),
  ALPACA_SECRET_KEY: z.string().default(""),
  ALPACA_PAPER: booleanString.default("true"),
  ALPACA_TRADING_BASE_URL: z.url().default("https://paper-api.alpaca.markets"),
  ALPACA_DATA_BASE_URL: z.url().default("https://data.alpaca.markets"),
  ALPACA_DATA_FEED: z.enum(["iex", "sip", "boats", "overnight"]).default("iex"),
  ALPACA_MCP_ENABLED: booleanString.default("false"),
  ALPACA_TOOLSETS: z.string().default("account,assets,stock-data,news"),
  AI_PROVIDER: z.enum(["openai", "mock"]).default("openai"),
  OPENAI_API_KEY: z.string().default(""),
  AI_MODEL: z.string().default("gpt-5.5"),
  DECISION_INTERVAL_MINUTES: z.coerce.number().int().min(1).default(5),
  DEFAULT_WATCHLIST: z.string().default("SPY,QQQ,AAPL,MSFT,NVDA,AMZN,META,GOOGL,TSLA,AMD"),
  MIN_PROPOSAL_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.65),
  MIN_CASH_RESERVE_PCT: z.coerce.number().min(0).max(100).default(10),
  RISK_PER_TRADE_PCT: z.coerce.number().positive().default(0.5),
  MAX_POSITION_PCT: z.coerce.number().positive().default(10),
  MAX_AGENT_ALLOCATION_PCT: z.coerce.number().positive().default(35),
  MAX_DAILY_LOSS_PCT: z.coerce.number().positive().default(2),
  MAX_DRAWDOWN_PCT: z.coerce.number().positive().default(5),
  MAX_OPEN_POSITIONS: z.coerce.number().int().positive().default(8),
  MAX_ORDERS_PER_CYCLE: z.coerce.number().int().positive().default(3),
});

export type Environment = z.infer<typeof EnvironmentSchema> & { watchlist: string[] };

export function loadEnvironment(source: Record<string, string | undefined> = process.env): Environment {
  const parsed = EnvironmentSchema.parse(source);
  const tradingUrl = new URL(parsed.ALPACA_TRADING_BASE_URL);
  if (!parsed.ALPACA_PAPER) throw new Error("AlphaGovernor is PAPER-ONLY: ALPACA_PAPER must be true.");
  if (tradingUrl.protocol !== "https:" || tradingUrl.hostname !== "paper-api.alpaca.markets") throw new Error("Unsafe Alpaca base URL: expected the paper-api.alpaca.markets endpoint.");
  const allowedToolsets = new Set(["account", "assets", "stock-data", "news"]);
  const configuredToolsets = parsed.ALPACA_TOOLSETS.split(",").map((item) => item.trim()).filter(Boolean);
  if (configuredToolsets.some((item) => !allowedToolsets.has(item))) throw new Error("Unsafe Alpaca MCP toolset: trading tools are forbidden for strategy agents.");
  return { ...parsed, watchlist: parsed.DEFAULT_WATCHLIST.split(",").map((symbol) => symbol.trim().toUpperCase()).filter(Boolean) };
}

export const DEFAULT_RISK_LIMITS = Object.freeze({
  riskPerTradePct: 0.5, maxPositionPct: 10, maxAgentAllocationPct: 35, maxSectorExposurePct: 30,
  maxDailyLossPct: 2, maxPortfolioDrawdownPct: 5, minCashReservePct: 10, minRewardRisk: 1.5,
  maxOpenPositions: 8, maxOrdersPerCycle: 3, minProposalConfidence: 0.65,
  maxPriceAgeSeconds: 120, maxAccountAgeSeconds: 60, maxPositionAgeSeconds: 60,
  minimumNotionalUsd: 25, buyingPowerSafetyFactor: 0.95,
});
export type RiskLimits = typeof DEFAULT_RISK_LIMITS;
