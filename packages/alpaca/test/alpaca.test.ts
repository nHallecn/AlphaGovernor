import { describe, expect, it } from "vitest";
import { createClientOrderId, MockTradingProvider } from "../src/index.js";

describe("provider safety and idempotency", () => {
  it("generates stable, bounded client order IDs", () => { const first = createClientOrderId("decision-123", 1); expect(first).toBe(createClientOrderId("decision-123", 1)); expect(first.length).toBeLessThanOrEqual(48); expect(first).not.toBe(createClientOrderId("decision-123", 2)); });
  it("mock provider preserves client order lineage", async () => { const provider = new MockTradingProvider(); const clientOrderId = createClientOrderId("decision-1", 1); await provider.placeOrder({ symbol: "NVDA", side: "buy", qty: 2, type: "market", timeInForce: "day", clientOrderId }); expect((await provider.listOrders({ clientOrderId }))[0]?.clientOrderId).toBe(clientOrderId); });
});
