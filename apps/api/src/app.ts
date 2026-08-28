import { randomUUID } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { success } from "@alphagovernor/contracts";
import type { Environment } from "@alphagovernor/config";
import type { MarketDataProvider, TradingProvider } from "@alphagovernor/alpaca";
import { OpenAiReasoningProvider, MockAiReasoningProvider } from "./services/ai.js";
import { DecisionOrchestrator } from "./services/orchestrator.js";
import { persistence } from "./services/persistence.js";
import { createProviders } from "./services/providers.js";
import { runtime } from "./services/runtime.js";

const RunSchema = z.object({ mode: z.enum(["LIVE_PAPER", "REPLAY"]).default("REPLAY") });
const AgentPatchSchema = z.object({ status: z.enum(["ACTIVE", "PROBATION", "SUSPENDED", "DISABLED"]) });
const ReplaySchema = z.object({
  name: z.string().min(2).max(100).default("Hackathon proof replay"),
  startTime: z.iso.datetime().optional(), endTime: z.iso.datetime().optional(),
  speed: z.number().int().min(1).max(100).default(20),
  symbols: z.array(z.string().regex(/^[A-Z.]+$/)).min(1).max(20).optional(),
  seed: z.number().int().default(42),
});
const RiskPatchSchema = z.object({
  riskPerTradePct: z.number().positive().max(5).optional(), maxPositionPct: z.number().positive().max(25).optional(),
  maxAgentAllocationPct: z.number().positive().max(50).optional(), maxSectorExposurePct: z.number().positive().max(50).optional(),
  maxDailyLossPct: z.number().positive().max(10).optional(), maxPortfolioDrawdownPct: z.number().positive().max(20).optional(),
  minCashReservePct: z.number().min(0).max(80).optional(), minRewardRisk: z.number().min(1).max(10).optional(),
  maxOpenPositions: z.number().int().positive().max(50).optional(), maxOrdersPerCycle: z.number().int().positive().max(10).optional(),
  minProposalConfidence: z.number().min(0.5).max(1).optional(),
}).strict();

export interface AppServices {
  env: Environment;
  trading: TradingProvider;
  market: MarketDataProvider;
  orchestrator: DecisionOrchestrator;
  realAlpaca: boolean;
}

function tokenFrom(request: FastifyRequest) {
  const authorization = request.headers.authorization;
  return request.headers["x-operator-token"] ?? (authorization?.startsWith("Bearer ") ? authorization.slice(7) : undefined);
}

async function requireOperator(request: FastifyRequest, reply: FastifyReply, env: Environment) {
  if (tokenFrom(request) !== env.OPERATOR_TOKEN) {
    return reply.code(401).send({ error: { code: "OPERATOR_AUTH_REQUIRED", message: "A valid operator token is required.", correlationId: request.id } });
  }
}

export async function buildApp(env: Environment, overrides: Partial<Omit<AppServices, "env">> = {}) {
  const providers = createProviders(env);
  const trading = overrides.trading ?? providers.trading;
  const market = overrides.market ?? providers.market;
  const ai = env.AI_PROVIDER === "openai" && env.OPENAI_API_KEY ? new OpenAiReasoningProvider(env) : new MockAiReasoningProvider();
  const orchestrator = overrides.orchestrator ?? new DecisionOrchestrator(env, trading, market, ai);
  const services: AppServices = { env, trading, market, orchestrator, realAlpaca: overrides.realAlpaca ?? providers.realAlpaca };
  const app = Fastify({ logger: env.NODE_ENV !== "test", requestIdHeader: "x-correlation-id", genReqId: () => randomUUID(), bodyLimit: 64 * 1024 });

  await app.register(cors, { origin: env.APP_BASE_URL, credentials: false });
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });

  app.setErrorHandler((error, request, reply) => {
    const normalized = error instanceof Error ? error : new Error("Unknown request failure.");
    const validation = error instanceof z.ZodError ? error.flatten() : undefined;
    const statusCode = "statusCode" in normalized && typeof normalized.statusCode === "number" ? normalized.statusCode : 500;
    const status = validation ? 400 : statusCode >= 400 ? statusCode : 500;
    request.log.error({ err: normalized, correlationId: request.id }, "request failed");
    reply.code(status).send({ error: { code: validation ? "INVALID_REQUEST" : "REQUEST_FAILED", message: validation ? "Request validation failed." : normalized.message, details: validation, correlationId: request.id } });
  });

  app.get("/api/v1/health", async () => success({
    status: persistence.available || env.DEMO_MODE ? "degraded" : "unhealthy",
    paperOnly: true, demoMode: env.DEMO_MODE, tradingStatus: runtime.tradingStatus,
    uptimeSeconds: Math.floor((Date.now() - runtime.startedAt) / 1000), providers: runtime.providerHealth,
  }));
  app.get("/api/v1/system/status", async () => success({ tradingStatus: runtime.tradingStatus, paperOnly: true, demoMode: env.DEMO_MODE, realAlpaca: services.realAlpaca, persistenceAvailable: persistence.available }));
  app.post("/api/v1/system/pause", { preHandler: (request, reply) => requireOperator(request, reply, env) }, async () => {
    const audit = runtime.updateTradingStatus("PAUSED", "Operator paused all new paper entries."); await persistence.appendAudit(audit);
    await persistence.setSystemStatus("PAUSED", false); return success({ tradingStatus: runtime.tradingStatus });
  });
  app.post("/api/v1/system/resume", { preHandler: (request, reply) => requireOperator(request, reply, env) }, async (_request, reply) => {
    if (!persistence.available) return reply.code(503).send({ error: { code: "DATABASE_UNAVAILABLE", message: "Cannot resume: PostgreSQL decision persistence is unavailable.", correlationId: _request.id } });
    await services.trading.getAccount();
    const audit = runtime.updateTradingStatus("RUNNING", "Operator resumed Alpaca paper decision cycles after provider health verification."); await persistence.appendAudit(audit);
    await persistence.setSystemStatus("RUNNING", true); return success({ tradingStatus: runtime.tradingStatus });
  });
  app.post("/api/v1/system/kill", { preHandler: (request, reply) => requireOperator(request, reply, env) }, async () => {
    const audit = runtime.updateTradingStatus("RISK_OFF", "Emergency kill switch engaged. New entries are disabled."); await persistence.appendAudit(audit);
    await persistence.setSystemStatus("RISK_OFF", false);
    await services.trading.cancelAllOrders();
    return success({ tradingStatus: runtime.tradingStatus, openOrdersCancelled: true });
  });

  app.get("/api/v1/account", async () => success(runtime.account));
  app.get("/api/v1/positions", async () => success(runtime.positions));
  app.get("/api/v1/orders", async () => success(runtime.orders));
  app.get("/api/v1/market/regime", async () => success(runtime.regime));
  app.get("/api/v1/market/watchlist", async () => success(env.watchlist.map((symbol, priority) => ({ symbol, priority, enabled: true }))));
  app.get("/api/v1/market/news", async () => success(await services.market.getNews({ symbols: env.watchlist, limit: 20 })));

  app.get("/api/v1/agents", async () => success(runtime.agents));
  app.get<{ Params: { id: string } }>("/api/v1/agents/:id", async (request, reply) => {
    const agent = runtime.agents.find((item) => item.id === request.params.id);
    return agent ? success(agent) : reply.code(404).send({ error: { code: "AGENT_NOT_FOUND", message: "Agent not found.", correlationId: request.id } });
  });
  app.patch<{ Params: { id: string } }>("/api/v1/agents/:id", { preHandler: (request, reply) => requireOperator(request, reply, env) }, async (request, reply) => {
    const agent = runtime.agents.find((item) => item.id === request.params.id);
    if (!agent) return reply.code(404).send({ error: { code: "AGENT_NOT_FOUND", message: "Agent not found.", correlationId: request.id } });
    const { status } = AgentPatchSchema.parse(request.body); agent.status = status;
    await persistence.appendAudit(runtime.appendAudit({ agentId: agent.id, eventType: "agent.status", severity: status === "ACTIVE" ? "INFO" : "WARN", message: `${agent.name} changed to ${status}.`, payload: { status } }));
    return success(agent);
  });

  app.get("/api/v1/decisions", async () => success(runtime.decisions));
  app.get<{ Params: { id: string } }>("/api/v1/decisions/:id", async (request, reply) => {
    const decision = runtime.decisions.find((item) => item.id === request.params.id);
    return decision ? success(decision) : reply.code(404).send({ error: { code: "DECISION_NOT_FOUND", message: "Decision cycle not found.", correlationId: request.id } });
  });
  app.post("/api/v1/decisions/run", { preHandler: (request, reply) => requireOperator(request, reply, env), config: { rateLimit: { max: 12, timeWindow: "1 minute" } } }, async (request) => {
    const { mode } = RunSchema.parse(request.body ?? {}); return success(await services.orchestrator.run(mode));
  });

  app.get("/api/v1/risk/profile", async () => success(runtime.riskProfile));
  app.patch("/api/v1/risk/profile", { preHandler: (request, reply) => requireOperator(request, reply, env) }, async (request) => {
    const changes = RiskPatchSchema.parse(request.body); Object.assign(runtime.riskProfile, changes);
    await persistence.appendAudit(runtime.appendAudit({ eventType: "risk.profile.updated", severity: "WARN", message: "Operator updated the deterministic Risk Constitution.", payload: changes }));
    return success(runtime.riskProfile);
  });
  app.get("/api/v1/audit", async (request) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(250).default(100) }).parse(request.query);
    return success(runtime.audit.slice(0, query.limit));
  });

  app.get("/api/v1/replays", async () => success(runtime.replays));
  app.post("/api/v1/replays", { preHandler: (request, reply) => requireOperator(request, reply, env) }, async (request) => {
    const input = ReplaySchema.parse(request.body ?? {}); const now = new Date();
    const replay = { id: randomUUID(), name: input.name, status: "RUNNING" as const, startTime: input.startTime ?? new Date(now.getTime() - 86_400_000).toISOString(), endTime: input.endTime ?? now.toISOString(), speed: input.speed, symbols: input.symbols ?? env.watchlist.slice(0, 5), seed: input.seed, progress: 0, createdAt: now.toISOString() };
    runtime.replays.unshift(replay); runtime.emit("replay.started", replay, replay.id);
    try {
      const cycle = await services.orchestrator.run("REPLAY");
      Object.assign(replay, { status: "COMPLETED", progress: 100, summary: { cycleId: cycle.id, proposals: cycle.proposals.length, orders: cycle.orders.length, rejected: cycle.riskDecisions.filter((item) => item.decision === "REJECT").length } });
      runtime.emit("replay.completed", replay, replay.id); return success(replay);
    } catch (error) {
      Object.assign(replay, { status: "FAILED", summary: { error: error instanceof Error ? error.message : "Replay failed" } }); throw error;
    }
  });

  app.get("/api/v1/events", async (request, reply) => {
    reply.hijack(); reply.raw.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ timestamp: new Date().toISOString(), paperOnly: true })}\n\n`);
    const listener = (event: unknown) => reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    runtime.events.on("event", listener); request.raw.on("close", () => runtime.events.off("event", listener));
  });

  app.decorate("alphaServices", services);
  return app;
}
