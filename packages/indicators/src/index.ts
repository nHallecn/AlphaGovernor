import type { IndicatorSnapshot, MarketBar, MarketRegime } from "@alphagovernor/contracts";

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export function ema(values: number[], period: number): Array<number | null> {
  if (!Number.isInteger(period) || period < 1) throw new Error("EMA period must be a positive integer.");
  const result: Array<number | null> = values.map(() => null);
  if (values.length < period) return result;
  let current = mean(values.slice(0, period));
  result[period - 1] = current;
  const multiplier = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    current = ((values[index] ?? current) - current) * multiplier + current;
    result[index] = current;
  }
  return result;
}

export function rsi(values: number[], period = 14): Array<number | null> {
  const result: Array<number | null> = values.map(() => null);
  if (values.length <= period) return result;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = (values[index] ?? 0) - (values[index - 1] ?? 0);
    gain += Math.max(0, change);
    loss += Math.max(0, -change);
  }
  let averageGain = gain / period;
  let averageLoss = loss / period;
  result[period] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  for (let index = period + 1; index < values.length; index += 1) {
    const change = (values[index] ?? 0) - (values[index - 1] ?? 0);
    averageGain = (averageGain * (period - 1) + Math.max(0, change)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(0, -change)) / period;
    result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return result;
}

export function atr(bars: Array<Pick<MarketBar, "high" | "low" | "close">>, period = 14): Array<number | null> {
  const result: Array<number | null> = bars.map(() => null);
  if (bars.length < period + 1) return result;
  const trueRanges = bars.map((bar, index) => index === 0 ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - (bars[index - 1]?.close ?? bar.close)), Math.abs(bar.low - (bars[index - 1]?.close ?? bar.close))));
  let current = mean(trueRanges.slice(1, period + 1));
  result[period] = current;
  for (let index = period + 1; index < bars.length; index += 1) {
    current = (current * (period - 1) + (trueRanges[index] ?? current)) / period;
    result[index] = current;
  }
  return result;
}

export function realizedVolatility(values: number[], period = 20, annualization = 252): number | null {
  if (values.length < period + 1) return null;
  const window = values.slice(-(period + 1));
  const returns = window.slice(1).map((value, index) => Math.log(value / (window[index] ?? value)));
  const average = mean(returns);
  const variance = returns.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(1, returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(annualization);
}

export function zScore(values: number[], period = 20): number | null {
  if (values.length < period) return null;
  const window = values.slice(-period);
  const average = mean(window);
  const variance = window.reduce((sum, value) => sum + (value - average) ** 2, 0) / Math.max(1, period - 1);
  const deviation = Math.sqrt(variance);
  return deviation === 0 ? 0 : ((window.at(-1) ?? average) - average) / deviation;
}

export function volumeRatio(volumes: number[], period = 20): number | null {
  if (volumes.length < period + 1) return null;
  const baseline = mean(volumes.slice(-(period + 1), -1));
  return baseline === 0 ? null : (volumes.at(-1) ?? 0) / baseline;
}

export function relativeStrength(instrument: number[], benchmark: number[], lookback = 20): number | null {
  if (instrument.length <= lookback || benchmark.length <= lookback) return null;
  const instrumentReturn = (instrument.at(-1) ?? 0) / (instrument.at(-(lookback + 1)) ?? 1) - 1;
  const benchmarkReturn = (benchmark.at(-1) ?? 0) / (benchmark.at(-(lookback + 1)) ?? 1) - 1;
  return clamp((instrumentReturn - benchmarkReturn) * 5, -1, 1);
}

export function buildIndicatorSnapshot(symbol: string, bars: MarketBar[], benchmarkBars: MarketBar[] = bars): IndicatorSnapshot {
  if (bars.length < 55) throw new Error(`Insufficient history for ${symbol}: 55 bars required.`);
  const closes = bars.map((bar) => bar.close);
  const benchmarkCloses = benchmarkBars.map((bar) => bar.close);
  const ema20Series = ema(closes, 20);
  const ema50Series = ema(closes, 50);
  const rsiSeries = rsi(closes, 14);
  const atrSeries = atr(bars, 14);
  const latest = bars.at(-1)!;
  return {
    symbol,
    timestamp: latest.timestamp,
    price: latest.close,
    ema20: ema20Series.at(-1) ?? null,
    ema50: ema50Series.at(-1) ?? null,
    rsi14: rsiSeries.at(-1) ?? null,
    atr14: atrSeries.at(-1) ?? null,
    realizedVol20: realizedVolatility(closes),
    zScore20: zScore(closes),
    volumeRatio: volumeRatio(bars.map((bar) => bar.volume)),
    relativeStrength: relativeStrength(closes, benchmarkCloses),
  };
}

export interface RegimeFeatures { trendScore: number; breadth: number; volPercentile: number; shockScore: number; materialNewsCount: number }
export interface RegimeThresholds { eventNewsThreshold: number; shock: number; highVol: number; trend: number; bullBreadth: number; bearBreadth: number; rangeTrend: number; rangeVol: number }
export const DEFAULT_REGIME_THRESHOLDS: RegimeThresholds = { eventNewsThreshold: 2, shock: 0.8, highVol: 0.8, trend: 0.65, bullBreadth: 0.6, bearBreadth: 0.4, rangeTrend: 0.25, rangeVol: 0.65 };

export function classifyRegime(features: RegimeFeatures, thresholds: RegimeThresholds = DEFAULT_REGIME_THRESHOLDS): { regime: MarketRegime; confidence: number; explanation: string } {
  let regime: MarketRegime;
  if (features.shockScore >= thresholds.shock || features.materialNewsCount >= thresholds.eventNewsThreshold) regime = "EVENT_SHOCK";
  else if (features.volPercentile >= thresholds.highVol) regime = "HIGH_VOL";
  else if (features.trendScore >= thresholds.trend && features.breadth >= thresholds.bullBreadth) regime = "BULL_TREND";
  else if (features.trendScore <= -thresholds.trend && features.breadth <= thresholds.bearBreadth) regime = "BEAR_TREND";
  else if (Math.abs(features.trendScore) <= thresholds.rangeTrend && features.volPercentile < thresholds.rangeVol) regime = "RANGE";
  else regime = "LOW_VOL";
  const confidence = clamp(Math.max(Math.abs(features.trendScore), features.volPercentile, features.shockScore), 0.5, 0.99);
  return { regime, confidence, explanation: `${regime}: trend ${features.trendScore.toFixed(2)}, breadth ${features.breadth.toFixed(2)}, volatility percentile ${features.volPercentile.toFixed(2)}, shock ${features.shockScore.toFixed(2)}.` };
}
