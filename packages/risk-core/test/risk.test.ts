import { describe, expect, it } from "vitest";
import type { TradeProposal } from "@alphagovernor/contracts";
import { reviewProposal, type RiskContext } from "../src/index.js";

const proposal: TradeProposal = {
  proposalId: "10000000-0000-4000-8000-000000000001", cycleId: "10000000-0000-4000-8000-000000000002", agentId: "10000000-0000-4000-8000-000000000003",
  symbol: "NVDA", action: "BUY", confidence: 0.82, requestedNotionalUsd: 3_200, timeHorizonMinutes: 240,
  thesis: "Trend, volume, and relative strength align for a controlled long entry.", invalidation: "The setup fails below the volatility-adjusted protective stop.",
  evidence: { price: 168, emaFast: 166, emaSlow: 160, rsi14: 62, atr14: 4, volumeRatio: 1.4, relativeStrength: 0.7, newsEventIds: [], summary: ["EMA20 above EMA50"] },
  proposedStopPrice: 164, proposedTakeProfitPrice: 178, generatedAt: "2026-08-25T14:00:00.000Z", dataAsOf: "2026-08-25T14:00:00.000Z",
};
const context: RiskContext = { paperMode: true, systemStatus: "RUNNING", marketOpen: true, accountFreshnessSeconds: 5, positionFreshnessSeconds: 5, priceFreshnessSeconds: 5, symbolEnabled: true, symbolTradable: true, equity: 100_000, buyingPower: 50_000, dayPnlPct: 0.2, portfolioDrawdownPct: 0.5, currentPrice: 168, currentSymbolExposureUsd: 0, agentBudgetUsd: 35_000, agentCurrentExposureUsd: 20_000, openPositionCount: 3, openEntryOrderForSymbol: false, ordersInCycle: 0, rewardRiskRatio: 2.5 };
const id = () => "10000000-0000-4000-8000-000000000099";
const now = new Date("2026-08-25T14:00:00.000Z");

describe("Risk Constitution", () => {
  it("approves a compliant proposal", () => expect(reviewProposal(proposal, context, undefined, id, now).decision).toBe("APPROVE"));
  it("resizes to the position cap", () => { const result = reviewProposal({ ...proposal, requestedNotionalUsd: 20_000 }, { ...context, equity: 80_000, agentCurrentExposureUsd: 0 }, undefined, id, now); expect(result.decision).toBe("RESIZE"); expect(result.approvedNotionalUsd).toBe(8_000); });
  it.each([
    ["PAPER_MODE", { paperMode: false }], ["SYSTEM_STATUS", { systemStatus: "PAUSED" }], ["MARKET_CLOCK", { marketOpen: false }],
    ["ACCOUNT_FRESH", { accountFreshnessSeconds: 61 }], ["POSITIONS_FRESH", { positionFreshnessSeconds: 61 }], ["PRICE_FRESH", { priceFreshnessSeconds: 121 }],
    ["DAILY_LOSS", { dayPnlPct: -2 }], ["DRAWDOWN", { portfolioDrawdownPct: 5 }], ["MAX_POSITIONS", { openPositionCount: 8 }],
    ["DUPLICATE_ORDER", { openEntryOrderForSymbol: true }], ["ORDERS_PER_CYCLE", { ordersInCycle: 3 }],
  ] as const)("rejects %s violations", (code, change) => expect(reviewProposal(proposal, { ...context, ...change }, undefined, id, now).rejectionCodes).toContain(code));
  it("allows an EXIT while paused and daily-loss locked", () => { const result = reviewProposal({ ...proposal, action: "EXIT", requestedNotionalUsd: 1_000, proposedStopPrice: undefined, proposedTakeProfitPrice: undefined }, { ...context, systemStatus: "RISK_OFF", marketOpen: false, dayPnlPct: -3, portfolioDrawdownPct: 6, currentSymbolExposureUsd: 1_000 }, undefined, id, now); expect(result.decision).toBe("APPROVE"); });
});
