import { PrismaClient, AgentType, AgentStatus, SystemTradingStatus } from "@prisma/client";

const prisma = new PrismaClient();
const agents = [
  { id: "a1000000-0000-4000-8000-000000000001", type: AgentType.MOMENTUM, name: "Momentum", description: "Trend, volume, and relative-strength strategy", trust: 60 },
  { id: "a1000000-0000-4000-8000-000000000002", type: AgentType.MEAN_REVERSION, name: "Mean Reversion", description: "Range-regime statistical stretch strategy", trust: 60 },
  { id: "a1000000-0000-4000-8000-000000000003", type: AgentType.NEWS, name: "News Intelligence", description: "Material-event structured reasoning agent", trust: 60 },
  { id: "a1000000-0000-4000-8000-000000000004", type: AgentType.DEFENSIVE, name: "Capital Preservation", description: "Portfolio protection and risk-off strategy", trust: 65 },
];
const watchlist = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "AMZN", "META", "GOOGL", "TSLA", "AMD"];

async function main() {
  for (const [index, item] of agents.entries()) {
    const agent = await prisma.agent.upsert({ where: { type: item.type }, update: { name: item.name, description: item.description }, create: { id: item.id, type: item.type, name: item.name, description: item.description, status: AgentStatus.ACTIVE } });
    const existing = await prisma.agentMetric.findFirst({ where: { agentId: agent.id } });
    if (!existing) await prisma.agentMetric.create({ data: { agentId: agent.id, trustScore: item.trust, pnlPct: index === 2 ? -0.4 : 0.8 + index, winRate: 0.5 + index * 0.03, maxDrawdownPct: 1 + index * 0.4, calibrationScore: 0.65 + index * 0.04, regimeScore: 0.6, executionQuality: 0.9, sampleSize: 0, source: "REPLAY" } });
  }
  await Promise.all(watchlist.map((symbol, priority) => prisma.watchlistItem.upsert({ where: { symbol }, update: { enabled: true, priority }, create: { symbol, enabled: true, priority, tags: symbol === "SPY" || symbol === "QQQ" ? ["ETF", "BENCHMARK"] : ["US_EQUITY"] } })));
  await prisma.riskProfile.updateMany({ data: { active: false } });
  const activeRisk = await prisma.riskProfile.findFirst({ where: { name: "Hackathon Constitution" } });
  const limits = { riskPerTradePct: 0.5, maxPositionPct: 10, maxAgentAllocationPct: 35, maxSectorExposurePct: 30, maxDailyLossPct: 2, maxPortfolioDrawdownPct: 5, minCashReservePct: 10, minRewardRisk: 1.5, maxOpenPositions: 8, maxOrdersPerCycle: 3, minProposalConfidence: 0.65 };
  if (activeRisk) await prisma.riskProfile.update({ where: { id: activeRisk.id }, data: { active: true, limitsJson: limits } }); else await prisma.riskProfile.create({ data: { name: "Hackathon Constitution", active: true, limitsJson: limits } });
  await prisma.systemState.upsert({ where: { id: "global" }, update: { paperMode: true }, create: { id: "global", paperMode: true, tradingStatus: SystemTradingStatus.PAUSED } });
  await prisma.auditEvent.create({ data: { eventType: "system.seeded", severity: "INFO", message: "Default agents, watchlist, constitution, and PAUSED safety state seeded.", payloadJson: { watchlist, paperMode: true } } });
}

main().finally(() => prisma.$disconnect());
