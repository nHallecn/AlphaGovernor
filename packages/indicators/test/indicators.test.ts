import { describe, expect, it } from "vitest";
import { atr, classifyRegime, ema, realizedVolatility, relativeStrength, rsi, volumeRatio, zScore } from "../src/index.js";

const ascending = Array.from({ length: 60 }, (_, index) => 100 + index);

describe("deterministic indicators", () => {
  it("calculates EMA with a seeded SMA", () => expect(ema([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]));
  it("calculates Wilder RSI and returns null during warmup", () => { const values = rsi(ascending); expect(values[13]).toBeNull(); expect(values.at(-1)).toBe(100); });
  it("calculates Wilder ATR", () => { const bars = ascending.map((close) => ({ high: close + 2, low: close - 2, close })); expect(atr(bars).at(-1)).toBeCloseTo(4); });
  it("calculates z-score and annualized realized volatility", () => { expect(zScore(ascending)).toBeGreaterThan(1); expect(realizedVolatility(ascending)).toBeGreaterThan(0); });
  it("calculates volume ratio and normalized relative strength", () => { expect(volumeRatio([...Array(20).fill(100), 150])).toBe(1.5); expect(relativeStrength(ascending, ascending.map((value) => value * 0.99))).toBeCloseTo(0); });
});

describe("market regime", () => {
  it("prioritizes event shock", () => expect(classifyRegime({ trendScore: 0.9, breadth: 0.9, volPercentile: 0.2, shockScore: 0.85, materialNewsCount: 0 }).regime).toBe("EVENT_SHOCK"));
  it("classifies bull, bear, and range regimes", () => {
    expect(classifyRegime({ trendScore: 0.8, breadth: 0.7, volPercentile: 0.4, shockScore: 0.1, materialNewsCount: 0 }).regime).toBe("BULL_TREND");
    expect(classifyRegime({ trendScore: -0.8, breadth: 0.3, volPercentile: 0.4, shockScore: 0.1, materialNewsCount: 0 }).regime).toBe("BEAR_TREND");
    expect(classifyRegime({ trendScore: 0.1, breadth: 0.5, volPercentile: 0.3, shockScore: 0.1, materialNewsCount: 0 }).regime).toBe("RANGE");
  });
});
