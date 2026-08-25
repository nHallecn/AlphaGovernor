import { db, Prisma } from "@alphagovernor/db";
import type { DecisionLineage, AuditRecord } from "./runtime.js";

export class PersistenceService {
  available = false;
  async connect() {
    try { await db.$connect(); await db.$queryRaw`SELECT 1`; this.available = true; } catch { this.available = false; }
    return this.available;
  }
  async disconnect() { if (this.available) await db.$disconnect(); }
  async appendAudit(record: AuditRecord) {
    if (!this.available) return;
    await db.auditEvent.create({ data: { id: record.id, cycleId: record.cycleId, agentId: record.agentId, proposalId: record.proposalId, orderId: record.orderId, eventType: record.eventType, severity: record.severity, message: record.message, payloadJson: record.payload as Prisma.InputJsonValue | undefined, createdAt: new Date(record.createdAt) } });
  }
  async setSystemStatus(status: "RUNNING" | "PAUSED" | "RISK_OFF", providerHealthy: boolean) {
    if (!this.available) return;
    await db.systemState.upsert({ where: { id: "global" }, update: { tradingStatus: status, paperMode: true, lastProviderOkAt: providerHealthy ? new Date() : undefined }, create: { id: "global", tradingStatus: status, paperMode: true, lastProviderOkAt: providerHealthy ? new Date() : undefined } });
  }
  async persistDecision(lineage: DecisionLineage) {
    if (!this.available || !lineage.governor) return;
    await db.$transaction(async (tx) => {
      const regime = lineage.regime ? await tx.marketRegimeSnapshot.create({ data: { id: lineage.regime.id, timestamp: new Date(lineage.regime.timestamp), regime: lineage.regime.regime, confidence: lineage.regime.confidence, metricsJson: lineage.regime.metrics, explanation: lineage.regime.explanation } }) : undefined;
      await tx.decisionCycle.create({ data: { id: lineage.id, mode: lineage.mode, status: lineage.status as "COMPLETED", startedAt: new Date(lineage.startedAt), completedAt: lineage.completedAt ? new Date(lineage.completedAt) : undefined, correlationId: `cycle-${lineage.id}`, regimeSnapshotId: regime?.id } });
      for (const proposal of lineage.proposals) await tx.tradeProposal.create({ data: { id: proposal.proposalId, cycleId: proposal.cycleId, agentId: proposal.agentId, symbol: proposal.symbol, action: proposal.action, confidence: proposal.confidence, requestedNotionalUsd: proposal.requestedNotionalUsd, stopPrice: proposal.proposedStopPrice, takeProfitPrice: proposal.proposedTakeProfitPrice, horizonMinutes: proposal.timeHorizonMinutes, thesis: proposal.thesis, invalidation: proposal.invalidation, evidenceJson: proposal.evidence, dataAsOf: new Date(proposal.dataAsOf), createdAt: new Date(proposal.generatedAt) } });
      await tx.governorDecision.create({ data: { id: lineage.governor.governorDecisionId, cycleId: lineage.id, selectedProposalIdsJson: lineage.governor.selectedProposalIds, rejectedProposalIdsJson: lineage.governor.rejectedProposalIds, scoresJson: lineage.governor.scores, rationale: lineage.governor.rationale, createdAt: new Date(lineage.governor.createdAt) } });
      for (const risk of lineage.riskDecisions) await tx.riskDecision.create({ data: { id: risk.riskDecisionId, proposalId: risk.proposalId, decision: risk.decision, approvedNotionalUsd: risk.approvedNotionalUsd, approvedQty: risk.approvedQty, stopPrice: risk.stopPrice, takeProfitPrice: risk.takeProfitPrice, checksJson: risk.checks, rejectionCodesJson: risk.rejectionCodes, createdAt: new Date(risk.createdAt) } });
    });
  }
}

export const persistence = new PersistenceService();
