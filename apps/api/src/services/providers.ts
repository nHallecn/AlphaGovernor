import { AlpacaPaperProvider, MockTradingProvider, type MarketDataProvider, type TradingProvider } from "@alphagovernor/alpaca";
import type { Environment } from "@alphagovernor/config";
import { DemoMarketDataProvider } from "./market.js";

export function createProviders(env: Environment): { trading: TradingProvider; market: MarketDataProvider; realAlpaca: boolean } {
  const hasCredentials = Boolean(env.ALPACA_API_KEY && env.ALPACA_SECRET_KEY);
  if (hasCredentials) {
    const alpaca = new AlpacaPaperProvider(env);
    return { trading: alpaca, market: env.DEMO_MODE ? new DemoMarketDataProvider(env.watchlist) : alpaca, realAlpaca: true };
  }
  return { trading: new MockTradingProvider(), market: new DemoMarketDataProvider(env.watchlist), realAlpaca: false };
}
