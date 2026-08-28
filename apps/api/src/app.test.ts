import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironment } from "@alphagovernor/config";
import { MockTradingProvider } from "@alphagovernor/alpaca";
import { buildApp } from "./app.js";
import { runtime } from "./services/runtime.js";

const env = loadEnvironment({ NODE_ENV: "test", OPERATOR_TOKEN: "test-operator-token", DEMO_MODE: "true" });
let app: Awaited<ReturnType<typeof buildApp>> | undefined;
afterEach(async () => { await app?.close(); app = undefined; runtime.tradingStatus = "PAUSED"; });

describe("HTTP safety boundary", () => {
  it("publishes paper-only health without authentication", async () => {
    app = await buildApp(env); const response = await app.inject({ method: "GET", url: "/api/v1/health" });
    expect(response.statusCode).toBe(200); expect(response.json().data.paperOnly).toBe(true);
  });
  it("protects state-changing operator routes", async () => {
    app = await buildApp(env); const response = await app.inject({ method: "POST", url: "/api/v1/system/kill" });
    expect(response.statusCode).toBe(401); expect(response.json().error.code).toBe("OPERATOR_AUTH_REQUIRED");
  });
  it("runs a deterministic replay while paper execution remains paused", async () => {
    app = await buildApp(env); const response = await app.inject({ method: "POST", url: "/api/v1/decisions/run", headers: { "x-operator-token": env.OPERATOR_TOKEN }, payload: { mode: "REPLAY" } });
    expect(response.statusCode).toBe(200); expect(response.json().data.mode).toBe("REPLAY"); expect(runtime.tradingStatus).toBe("PAUSED");
  });
  it("never reaches provider execution when decision persistence is unavailable", async () => {
    const trading = new MockTradingProvider(); const placeOrder = vi.spyOn(trading, "placeOrder"); runtime.tradingStatus = "RUNNING";
    app = await buildApp(env, { trading });
    const response = await app.inject({ method: "POST", url: "/api/v1/decisions/run", headers: { "x-operator-token": env.OPERATOR_TOKEN }, payload: { mode: "LIVE_PAPER" } });
    expect(response.statusCode).toBe(500); expect(response.json().error.message).toContain("PostgreSQL"); expect(placeOrder).not.toHaveBeenCalled();
  });
});
