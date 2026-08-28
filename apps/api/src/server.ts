import { env } from "./config/env.js";
import { buildApp } from "./app.js";
import { createProviders } from "./services/providers.js";
import { persistence } from "./services/persistence.js";
import { OpenAiReasoningProvider, MockAiReasoningProvider } from "./services/ai.js";
import { DecisionOrchestrator } from "./services/orchestrator.js";
import { DecisionQueueService } from "./services/queue.js";
import { runtime } from "./services/runtime.js";

const providers = createProviders(env);
const ai = env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY ? new OpenAiReasoningProvider(env) : new MockAiReasoningProvider();
const orchestrator = new DecisionOrchestrator(env, providers.trading, providers.market, ai);
const app = await buildApp(env, { ...providers, orchestrator });
const queue = new DecisionQueueService(env, orchestrator);

const databaseOk = await persistence.connect();
runtime.providerHealth.database = databaseOk ? "healthy" : "unavailable";
try {
  await providers.trading.getAccount(); runtime.providerHealth.alpacaRest = providers.realAlpaca ? "healthy" : "demo";
} catch (error) {
  runtime.providerHealth.alpacaRest = "unavailable"; runtime.updateTradingStatus("PAUSED", error instanceof Error ? error.message : "Alpaca paper provider unavailable.");
}
await queue.start();

const shutdown = async () => { await queue.stop(); await app.close(); await persistence.disconnect(); };
process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

await app.listen({ host: "0.0.0.0", port: 4000 });

