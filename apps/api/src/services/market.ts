import { randomUUID } from "node:crypto";
import type { MarketBar } from "@alphagovernor/contracts";
import type { MarketDataProvider, ProviderNews } from "@alphagovernor/alpaca";

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly bars: MarketBar[];
  readonly news: ProviderNews[];
  constructor(symbols: string[], anchor = new Date("2026-08-25T14:00:00.000Z")) {
    this.bars = symbols.flatMap((symbol, symbolIndex) => Array.from({ length: 60 }, (_, index) => {
      const benchmarkSlope = symbol === "SPY" ? 0.10 : symbol === "NVDA" ? 0.26 : 0.08 + symbolIndex * 0.005;
      const oscillation = Math.sin(index * 0.72 + symbolIndex) * (symbol === "NVDA" ? 0.7 : 0.35);
      const close = 100 + symbolIndex * 7 + index * benchmarkSlope + oscillation;
      const timestamp = new Date(anchor.getTime() - (59 - index) * 5 * 60_000).toISOString();
      return { symbol, timestamp, open: close - 0.12, high: close + 0.65, low: close - 0.55, close, volume: index === 59 && symbol === "NVDA" ? 1_500_000 : 1_000_000 + index * 1_500, vwap: close - 0.03 };
    }));
    this.news = [{ id: randomUUID(), headline: "NVDA raises data-center guidance", summary: "The company cited stronger-than-expected accelerator demand while reiterating supply constraints.", source: "Demo Wire", url: "https://example.invalid/demo-news", symbols: ["NVDA"], publishedAt: new Date(anchor.getTime() - 12 * 60_000).toISOString() }];
  }
  async getBars(request: { symbols: string[]; timeframe: string; start?: string; end?: string; limit?: number }) { return this.bars.filter((bar) => request.symbols.includes(bar.symbol) && (!request.start || bar.timestamp >= request.start) && (!request.end || bar.timestamp <= request.end)).slice(-(request.limit ?? 1000)); }
  async getLatestBars(symbols: string[]) { return Object.fromEntries(symbols.flatMap((symbol) => { const bar = this.bars.filter((item) => item.symbol === symbol).at(-1); return bar ? [[symbol, bar]] : []; })); }
  async getNews(request: { symbols: string[]; start?: string; limit?: number }) { return this.news.filter((item) => item.symbols.some((symbol) => request.symbols.includes(symbol)) && (!request.start || item.publishedAt >= request.start)).slice(0, request.limit ?? 50); }
}
