import { randomUUID } from "node:crypto";
import { AgentStatusSchema, type AgentType, type DecisionMode, type IndicatorSnapshot, type MarketRegimeSnapshot, type TradeProposal } from "@alphagovernor/contracts";
import { DefensiveAgent, MeanReversionAgent, MomentumAgent, NewsAgent, allocateAgents, governProposals, type AiReasoningProvider, type AgentEvaluationResult, type TradingAgent } from "@alphagovernor/agent-core";
import type { Environment } from "@alphagovernor/config";
import { buildIndicatorSnapshot, classifyRegime } from "@alphagovernor/indicators";
import { reviewProposal } from "@alphagovernor/risk-core";
import type { MarketDataProvider, TradingProvider } from "@alphagovernor/alpaca";
import { ExecutionService } from "./execution.js";
import { persistence } from "./persistence.js";
import { runtime, type DecisionLineage } from "./runtime.js";

export class DecisionOrchestrator {
  private readonly agents: TradingAgent[];
  private readonly execution: ExecutionService;
  constructor(private readonly env: Environment, private readonly trading: TradingProvider, private readonly market: MarketDataProvider, ai: AiReasoningProvider) {
    this.agents = [new MomentumAgent(), new MeanReversionAgent(), new NewsAgent(ai), new DefensiveAgent()];
    this.execution = new ExecutionService(trading);
  }

  async run(mode: DecisionMode): Promise<DecisionLineage> {
    if (mode === "LIVE_PAPER" && runtime.tradingStatus !== "RUNNING") throw new Error(`Paper decision execution is blocked while system status is ${runtime.tradingStatus}.`);
    if (mode === "LIVE_PAPER" && !persistence.available) throw new Error("Paper execution fails closed because PostgreSQL is unavailable.");
    const cycleId = randomUUID();
    const now = new Date();
    const lineage: DecisionLineage = { id: cycleId, mode, status: "CREATED", startedAt: now.toISOString(), proposals: [], abstentions: [], riskDecisions: [], orders: [], auditEvents: [] };
    runtime.decisions.unshift(lineage);
    runtime.appendAudit({ cycleId, eventType: "cycle.started", severity: "INFO", message: `${mode} decision cycle started.`, payload: { mode } });
    runtime.emit("cycle.started", { cycleId, mode }, cycleId);

    try {
      const [account, positions, bars, news, clock] = await Promise.all([
        this.trading.getAccount(), this.trading.getPositions(), this.market.getBars({ symbols: this.env.watchlist, timeframe: "5Min", limit: 1000 }), this.market.getNews({ symbols: this.env.watchlist, limit: 20 }), this.trading.getClock(),
      ]);
      runtime.account = account;
      runtime.positions = positions.length ? positions : runtime.positions;
      runtime.providerHealth.lastAccountSync = account.timestamp;
      runtime.providerHealth.lastPositionSync = new Date().toISOString();
      lineage.status = "DATA_READY";
      const benchmark = bars.filter((bar) => bar.symbol === "SPY");
      const snapshots: IndicatorSnapshot[] = [];
      for (const symbol of this.env.watchlist) {
        const symbolBars = bars.filter((bar) => bar.symbol === symbol);
        if (symbolBars.length >= 55) snapshots.push(buildIndicatorSnapshot(symbol, symbolBars, benchmark));
      }
      if (!snapshots.length) throw new Error("No watchlist symbol has sufficient indicator history.");
      const regimeResult = classifyRegime({ trendScore: 0.78, breadth: 0.68, volPercentile: 0.48, shockScore: news.length >= 2 ? 0.82 : 0.12, materialNewsCount: news.length >= 2 ? 2 : 1 });
      const regime: MarketRegimeSnapshot = { id: randomUUID(), timestamp: now.toISOString(), regime: regimeResult.regime, confidence: regimeResult.confidence, metrics: { trendScore: 0.78, breadth: 0.68, volPercentile: 0.48, shockScore: news.length >= 2 ? 0.82 : 0.12 }, explanation: regimeResult.explanation };
      runtime.regime = regime;
      lineage.regime = regime;
      runtime.emit("market.regime.changed", regime, cycleId);

      const allocations = allocateAgents(runtime.agents.map((agent) => ({ agentId: agent.id, type: agent.type, status: AgentStatusSchema.parse(agent.status), trust: agent.trustScore })), regime.regime, 0.9, this.env.MAX_AGENT_ALLOCATION_PCT / 100);
      for (const agent of runtime.agents) { agent.allocationWeight = allocations[agent.id] ?? 0; agent.maxNotionalUsd = account.equity * agent.allocationWeight; agent.regimeCompatibility = ({ MOMENTUM: { BULL_TREND: .95, BEAR_TREND: .75, RANGE: .3, HIGH_VOL: .55, LOW_VOL: .7, EVENT_SHOCK: .45 }, MEAN_REVERSION: { BULL_TREND: .45, BEAR_TREND: .45, RANGE: .95, HIGH_VOL: .55, LOW_VOL: .75, EVENT_SHOCK: .3 }, NEWS: { BULL_TREND: .65, BEAR_TREND: .65, RANGE: .45, HIGH_VOL: .75, LOW_VOL: .4, EVENT_SHOCK: 1 }, DEFENSIVE: { BULL_TREND: .25, BEAR_TREND: .95, RANGE: .35, HIGH_VOL: 1, LOW_VOL: .3, EVENT_SHOCK: .9 } } as const)[agent.type][regime.regime]; }
      const instrumentContext = snapshots.map((indicators) => ({ symbol: indicators.symbol, indicators, priceAgeSeconds: mode === "REPLAY" ? 0 : Math.max(0, (Date.now() - new Date(indicators.timestamp).getTime()) / 1000) }));
      const portfolio = { equity: account.equity, cash: account.cash, drawdownPct: Math.max(0, ((Math.max(account.previousEquity, account.equity) - account.equity) / Math.max(1, Math.max(account.previousEquity, account.equity))) * 100), dayPnlPct: account.previousEquity ? ((account.equity - account.previousEquity) / account.previousEquity) * 100 : 0, positions: runtime.positions.map((position) => ({ symbol: position.symbol, marketValue: position.marketValue, qty: position.qty })) };
      const normalizedNews = news.filter((item) => item.symbols[0]).map((item) => ({ id: /^[0-9a-f-]{36}$/i.test(item.id) ? item.id : randomUUID(), symbol: item.symbols[0]!, headline: item.headline, summary: item.summary, publishedAt: item.publishedAt }));
      const evaluations = await Promise.all(this.agents.map(async (agent): Promise<{ type: AgentType; result: AgentEvaluationResult }> => ({ type: agent.type, result: await agent.evaluate({ cycleId, now, regime, allocation: { maxNotionalUsd: account.equity * (allocations[agent.id] ?? 0) }, instruments: instrumentContext, portfolio, recentNews: normalizedNews }) })));
      lineage.status = "AGENTS_COMPLETE";
      for (const evaluation of evaluations) {
        if (evaluation.result.kind === "proposal") { lineage.proposals.push(evaluation.result.proposal); runtime.appendAudit({ cycleId, agentId: evaluation.result.proposal.agentId, proposalId: evaluation.result.proposal.proposalId, eventType: "proposal.created", severity: "INFO", message: `${evaluation.type} proposed ${evaluation.result.proposal.action} ${evaluation.result.proposal.symbol}.`, payload: evaluation.result.proposal }); runtime.emit("proposal.created", evaluation.result.proposal, cycleId); }
        else lineage.abstentions.push(evaluation.result.abstain);
      }
      const agentById = new Map(runtime.agents.map((agent) => [agent.id, agent]));
      const governor = governProposals(cycleId, lineage.proposals.map((proposal) => { const agent = agentById.get(proposal.agentId)!; return { proposal, trustScore: agent.trustScore, agentType: agent.type, regime: regime.regime, freshnessScore: 1 }; }), allocations, randomUUID, now, this.env.MIN_PROPOSAL_CONFIDENCE, this.env.MAX_ORDERS_PER_CYCLE);
      lineage.governor = governor; lineage.status = "GOVERNED";
      runtime.appendAudit({ cycleId, eventType: "governor.decided", severity: "INFO", message: governor.rationale, payload: governor }); runtime.emit("governor.decided", governor, cycleId);

      for (const proposalId of governor.selectedProposalIds) {
        const proposal = lineage.proposals.find((item) => item.proposalId === proposalId)!;
        const agent = agentById.get(proposal.agentId)!;
        const position = runtime.positions.find((item) => item.symbol === proposal.symbol);
        const stop = proposal.proposedStopPrice; const target = proposal.proposedTakeProfitPrice; const price = proposal.evidence.price;
        const rewardRiskRatio = stop && target ? Math.abs(target - price) / Math.max(0.0001, Math.abs(price - stop)) : undefined;
        const risk = reviewProposal(proposal, { paperMode: true, systemStatus: mode === "REPLAY" ? "RUNNING" : runtime.tradingStatus, marketOpen: mode === "REPLAY" ? true : clock.isOpen, accountFreshnessSeconds: 0, positionFreshnessSeconds: 0, priceFreshnessSeconds: mode === "REPLAY" ? 0 : instrumentContext.find((item) => item.symbol === proposal.symbol)?.priceAgeSeconds ?? 999, symbolEnabled: this.env.watchlist.includes(proposal.symbol), symbolTradable: true, equity: account.equity, buyingPower: account.buyingPower, dayPnlPct: portfolio.dayPnlPct, portfolioDrawdownPct: portfolio.drawdownPct, currentPrice: price, currentSymbolExposureUsd: Math.abs(position?.marketValue ?? 0), agentBudgetUsd: agent.maxNotionalUsd, agentCurrentExposureUsd: runtime.positions.filter((item) => item.originatingAgentId === agent.id).reduce((sum, item) => sum + Math.abs(item.marketValue), 0), openPositionCount: runtime.positions.length, openEntryOrderForSymbol: runtime.orders.some((order) => order.symbol === proposal.symbol && !["filled", "canceled", "rejected"].includes(order.status)), ordersInCycle: lineage.orders.length, rewardRiskRatio });
        lineage.riskDecisions.push(risk);
        runtime.appendAudit({ cycleId, proposalId, eventType: "risk.decided", severity: risk.decision === "REJECT" ? "WARN" : "INFO", message: `Risk Guardian ${risk.decision} for ${proposal.symbol}.`, payload: risk }); runtime.emit("risk.decided", risk, cycleId);
        if (risk.decision !== "REJECT") { const order = await this.execution.execute(proposal, risk, mode); lineage.orders.push(order); }
      }
      lineage.status = "COMPLETED"; lineage.completedAt = new Date().toISOString();
      runtime.appendAudit({ cycleId, eventType: "cycle.completed", severity: "INFO", message: `Cycle completed with ${lineage.proposals.length} proposal(s), ${lineage.riskDecisions.length} risk review(s), and ${lineage.orders.length} order(s).`, payload: { mode } });
      await persistence.persistDecision(lineage);
      return lineage;
    } catch (error) {
      lineage.status = "FAILED"; lineage.completedAt = new Date().toISOString();
      runtime.appendAudit({ cycleId, eventType: "cycle.failed", severity: "ERROR", message: error instanceof Error ? error.message : "Decision cycle failed." });
      throw error;
    }
  }
}
