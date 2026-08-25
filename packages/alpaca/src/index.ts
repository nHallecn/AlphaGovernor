import { createHash, randomUUID } from "node:crypto";
import type { BrokerAccount, BrokerOrder, BrokerPosition, MarketBar } from "@alphagovernor/contracts";
import type { Environment } from "@alphagovernor/config";

export interface MarketClock { isOpen: boolean; timestamp: string; nextOpen: string; nextClose: string }
export interface PlaceOrderRequest { symbol: string; side: "buy" | "sell"; qty: number; type: "market" | "limit"; timeInForce: "day"; clientOrderId: string; limitPrice?: number }
export interface TradingProvider {
  getAccount(): Promise<BrokerAccount>;
  getPositions(): Promise<BrokerPosition[]>;
  listOrders(filter?: { status?: string; clientOrderId?: string }): Promise<BrokerOrder[]>;
  placeOrder(request: PlaceOrderRequest): Promise<{ order: BrokerOrder; requestId?: string }>;
  cancelOrder(orderId: string): Promise<void>;
  cancelAllOrders(): Promise<void>;
  getClock(): Promise<MarketClock>;
}
export interface MarketDataProvider {
  getBars(request: { symbols: string[]; timeframe: string; start?: string; end?: string; limit?: number }): Promise<MarketBar[]>;
  getLatestBars(symbols: string[]): Promise<Record<string, MarketBar>>;
  getNews(request: { symbols: string[]; start?: string; limit?: number }): Promise<ProviderNews[]>;
}
export interface ProviderNews { id: string; headline: string; summary: string; source: string; url: string; symbols: string[]; publishedAt: string }

export class ProviderError extends Error { constructor(message: string, readonly status: number, readonly requestId?: string) { super(message); this.name = "ProviderError"; } }
export class OrderUnknownStateError extends Error { constructor(readonly clientOrderId: string, message: string) { super(message); this.name = "OrderUnknownStateError"; } }

export function createClientOrderId(decisionId: string, attempt: number): string {
  const digest = createHash("sha256").update(decisionId).digest("hex").slice(0, 16);
  return `ag-${digest}-${attempt}`.slice(0, 48);
}

const numberValue = (value: string | number | null | undefined) => value == null ? 0 : Number(value);

export class AlpacaPaperProvider implements TradingProvider, MarketDataProvider {
  private readonly tradingBase: string;
  private readonly dataBase: string;
  private readonly headers: Record<string, string>;
  constructor(private readonly env: Environment, private readonly fetcher: typeof fetch = fetch) {
    const url = new URL(env.ALPACA_TRADING_BASE_URL);
    if (!env.ALPACA_PAPER || url.hostname !== "paper-api.alpaca.markets") throw new Error("AlpacaPaperProvider refuses non-paper configuration.");
    if (!env.ALPACA_API_KEY || !env.ALPACA_SECRET_KEY) throw new Error("Alpaca paper credentials are required for the real provider.");
    this.tradingBase = url.origin;
    this.dataBase = new URL(env.ALPACA_DATA_BASE_URL).origin;
    this.headers = { "APCA-API-KEY-ID": env.ALPACA_API_KEY, "APCA-API-SECRET-KEY": env.ALPACA_SECRET_KEY, "Content-Type": "application/json" };
  }
  private async request<T>(base: string, path: string, init?: RequestInit): Promise<{ data: T; requestId?: string }> {
    const response = await this.fetcher(`${base}${path}`, { ...init, headers: { ...this.headers, ...(init?.headers ?? {}) }, cache: "no-store" });
    const requestId = response.headers.get("x-request-id") ?? undefined;
    if (!response.ok) throw new ProviderError(`Alpaca ${response.status}: ${(await response.text()).slice(0, 300)}`, response.status, requestId);
    return { data: await response.json() as T, requestId };
  }
  async getAccount(): Promise<BrokerAccount> {
    const { data } = await this.request<Record<string, string | boolean | number>>(this.tradingBase, "/v2/account");
    return { equity: numberValue(data.equity as string), cash: numberValue(data.cash as string), buyingPower: numberValue(data.buying_power as string), portfolioValue: numberValue(data.portfolio_value as string), previousEquity: numberValue(data.last_equity as string), daytradeCount: numberValue(data.daytrade_count as number), tradingBlocked: Boolean(data.trading_blocked || data.account_blocked), timestamp: new Date().toISOString() };
  }
  async getPositions(): Promise<BrokerPosition[]> {
    const { data } = await this.request<Array<Record<string, string>>>(this.tradingBase, "/v2/positions");
    return data.map((position) => ({ symbol: position.symbol ?? "", qty: numberValue(position.qty), avgEntryPrice: numberValue(position.avg_entry_price), marketValue: numberValue(position.market_value), costBasis: numberValue(position.cost_basis), unrealizedPl: numberValue(position.unrealized_pl), unrealizedPlPct: numberValue(position.unrealized_plpc) * 100, currentPrice: numberValue(position.current_price) }));
  }
  async listOrders(filter: { status?: string; clientOrderId?: string } = {}): Promise<BrokerOrder[]> {
    const query = new URLSearchParams({ status: filter.status ?? "all", limit: "100", direction: "desc" });
    const { data } = await this.request<Array<Record<string, string | null>>>(this.tradingBase, `/v2/orders?${query}`);
    return data.filter((order) => !filter.clientOrderId || order.client_order_id === filter.clientOrderId).map(normalizeOrder);
  }
  async placeOrder(request: PlaceOrderRequest): Promise<{ order: BrokerOrder; requestId?: string }> {
    try {
      const { data, requestId } = await this.request<Record<string, string | null>>(this.tradingBase, "/v2/orders", { method: "POST", body: JSON.stringify({ symbol: request.symbol, side: request.side, qty: String(request.qty), type: request.type, time_in_force: request.timeInForce, client_order_id: request.clientOrderId, ...(request.limitPrice ? { limit_price: String(request.limitPrice) } : {}) }) });
      return { order: normalizeOrder(data), requestId };
    } catch (error) {
      if (error instanceof TypeError) throw new OrderUnknownStateError(request.clientOrderId, "Order request ended in an unknown provider state; reconcile before retrying.");
      throw error;
    }
  }
  async cancelOrder(orderId: string): Promise<void> { await this.request(this.tradingBase, `/v2/orders/${encodeURIComponent(orderId)}`, { method: "DELETE" }); }
  async cancelAllOrders(): Promise<void> { await this.request(this.tradingBase, "/v2/orders", { method: "DELETE" }); }
  async getClock(): Promise<MarketClock> { const { data } = await this.request<Record<string, string | boolean>>(this.tradingBase, "/v2/clock"); return { isOpen: Boolean(data.is_open), timestamp: String(data.timestamp), nextOpen: String(data.next_open), nextClose: String(data.next_close) }; }
  async getBars(request: { symbols: string[]; timeframe: string; start?: string; end?: string; limit?: number }): Promise<MarketBar[]> {
    const query = new URLSearchParams({ symbols: request.symbols.join(","), timeframe: request.timeframe, feed: this.env.ALPACA_DATA_FEED, adjustment: "raw", limit: String(request.limit ?? 1000) });
    if (request.start) query.set("start", request.start); if (request.end) query.set("end", request.end);
    const { data } = await this.request<{ bars: Record<string, Array<{ t: string; o: number; h: number; l: number; c: number; v: number; vw?: number }>> }>(this.dataBase, `/v2/stocks/bars?${query}`);
    return Object.entries(data.bars ?? {}).flatMap(([symbol, bars]) => bars.map((bar) => ({ symbol, timestamp: bar.t, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v, vwap: bar.vw })));
  }
  async getLatestBars(symbols: string[]): Promise<Record<string, MarketBar>> {
    const query = new URLSearchParams({ symbols: symbols.join(","), feed: this.env.ALPACA_DATA_FEED });
    const { data } = await this.request<{ bars: Record<string, { t: string; o: number; h: number; l: number; c: number; v: number; vw?: number }> }>(this.dataBase, `/v2/stocks/bars/latest?${query}`);
    return Object.fromEntries(Object.entries(data.bars ?? {}).map(([symbol, bar]) => [symbol, { symbol, timestamp: bar.t, open: bar.o, high: bar.h, low: bar.l, close: bar.c, volume: bar.v, vwap: bar.vw }]));
  }
  async getNews(request: { symbols: string[]; start?: string; limit?: number }): Promise<ProviderNews[]> {
    const query = new URLSearchParams({ symbols: request.symbols.join(","), limit: String(request.limit ?? 50), sort: "desc" }); if (request.start) query.set("start", request.start);
    const { data } = await this.request<{ news: Array<{ id: number; headline: string; summary: string; source: string; url: string; symbols: string[]; created_at: string }> }>(this.dataBase, `/v1beta1/news?${query}`);
    return (data.news ?? []).map((item) => ({ id: String(item.id), headline: item.headline, summary: item.summary, source: item.source, url: item.url, symbols: item.symbols, publishedAt: item.created_at }));
  }
}

function normalizeOrder(order: Record<string, string | null>): BrokerOrder {
  return { id: order.id ?? "", clientOrderId: order.client_order_id ?? "", symbol: order.symbol ?? "", side: order.side === "sell" ? "sell" : "buy", type: order.type ?? "market", timeInForce: order.time_in_force ?? "day", status: order.status ?? "unknown", qty: order.qty ? Number(order.qty) : undefined, notional: order.notional ? Number(order.notional) : undefined, filledQty: numberValue(order.filled_qty), filledAvgPrice: order.filled_avg_price ? Number(order.filled_avg_price) : undefined, submittedAt: order.submitted_at ?? undefined, updatedAt: order.updated_at ?? new Date().toISOString() };
}

export class MockTradingProvider implements TradingProvider {
  readonly orders: BrokerOrder[] = [];
  account: BrokerAccount = { equity: 100_000, cash: 50_000, buyingPower: 100_000, portfolioValue: 100_000, previousEquity: 100_000, daytradeCount: 0, tradingBlocked: false, timestamp: new Date().toISOString() };
  positions: BrokerPosition[] = [];
  marketOpen = true;
  async getAccount() { return { ...this.account, timestamp: new Date().toISOString() }; }
  async getPositions() { return structuredClone(this.positions); }
  async listOrders(filter: { status?: string; clientOrderId?: string } = {}) { return this.orders.filter((order) => (!filter.clientOrderId || order.clientOrderId === filter.clientOrderId) && (!filter.status || filter.status === "all" || order.status === filter.status)); }
  async placeOrder(request: PlaceOrderRequest) { const now = new Date().toISOString(); const order: BrokerOrder = { id: randomUUID(), clientOrderId: request.clientOrderId, symbol: request.symbol, side: request.side, type: request.type, timeInForce: request.timeInForce, status: "accepted", qty: request.qty, filledQty: 0, updatedAt: now, submittedAt: now }; this.orders.push(order); return { order, requestId: `mock-${order.id}` }; }
  async cancelOrder(orderId: string) { const order = this.orders.find((item) => item.id === orderId); if (order) { order.status = "canceled"; order.updatedAt = new Date().toISOString(); } }
  async cancelAllOrders() { for (const order of this.orders.filter((item) => !["filled", "canceled", "rejected"].includes(item.status))) order.status = "canceled"; }
  async getClock(): Promise<MarketClock> { const timestamp = new Date().toISOString(); return { isOpen: this.marketOpen, timestamp, nextOpen: timestamp, nextClose: timestamp }; }
}

export class ReplayMarketDataProvider implements MarketDataProvider {
  constructor(private readonly bars: MarketBar[], private readonly news: ProviderNews[] = [], private cursorTime?: string) {}
  setCursor(timestamp: string) { this.cursorTime = timestamp; }
  private visibleBars() { return this.cursorTime ? this.bars.filter((bar) => bar.timestamp <= this.cursorTime!) : this.bars; }
  async getBars(request: { symbols: string[]; timeframe: string; start?: string; end?: string; limit?: number }) { return this.visibleBars().filter((bar) => request.symbols.includes(bar.symbol) && (!request.start || bar.timestamp >= request.start) && (!request.end || bar.timestamp <= request.end)).slice(-(request.limit ?? 1000)); }
  async getLatestBars(symbols: string[]) { const result: Record<string, MarketBar> = {}; for (const symbol of symbols) { const bar = this.visibleBars().filter((item) => item.symbol === symbol).at(-1); if (bar) result[symbol] = bar; } return result; }
  async getNews(request: { symbols: string[]; start?: string; limit?: number }) { return this.news.filter((item) => item.symbols.some((symbol) => request.symbols.includes(symbol)) && (!this.cursorTime || item.publishedAt <= this.cursorTime) && (!request.start || item.publishedAt >= request.start)).slice(0, request.limit ?? 50); }
}
