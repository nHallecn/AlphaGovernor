import { Queue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { Environment } from "@alphagovernor/config";
import type { DecisionOrchestrator } from "./orchestrator.js";
import { runtime } from "./runtime.js";

export class DecisionQueueService {
  private connection?: Redis;
  private queue?: Queue;
  private worker?: Worker;
  constructor(private readonly env: Environment, private readonly orchestrator: DecisionOrchestrator) {}

  async start() {
    try {
      this.connection = new Redis(this.env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null, enableOfflineQueue: false });
      await this.connection.connect(); await this.connection.ping();
      this.queue = new Queue("decision-cycles", { connection: this.connection });
      this.worker = new Worker("decision-cycles", async () => this.orchestrator.run("LIVE_PAPER"), { connection: this.connection, concurrency: 1 });
      this.worker.on("failed", (_job, error) => runtime.appendAudit({ eventType: "queue.cycle.failed", severity: "ERROR", message: error.message }));
      await this.queue.upsertJobScheduler("scheduled-paper-cycle", { every: this.env.DECISION_INTERVAL_MINUTES * 60_000 }, { name: "scheduled-paper-cycle", data: {}, opts: { removeOnComplete: 100, removeOnFail: 100 } });
      runtime.providerHealth.redis = "healthy"; return true;
    } catch (error) {
      runtime.providerHealth.redis = "unavailable";
      runtime.appendAudit({ eventType: "provider.redis.unavailable", severity: "WARN", message: error instanceof Error ? error.message : "Redis is unavailable." });
      await this.stop(); return false;
    }
  }

  async stop() {
    await this.worker?.close().catch(() => undefined); await this.queue?.close().catch(() => undefined); await this.connection?.quit().catch(() => undefined);
  }
}
