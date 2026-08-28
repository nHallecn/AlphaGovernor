CREATE TYPE "AgentType" AS ENUM ('MOMENTUM', 'MEAN_REVERSION', 'NEWS', 'DEFENSIVE');
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'PROBATION', 'SUSPENDED', 'DISABLED');
CREATE TYPE "MarketRegime" AS ENUM ('BULL_TREND', 'BEAR_TREND', 'RANGE', 'HIGH_VOL', 'LOW_VOL', 'EVENT_SHOCK');
CREATE TYPE "ProposalAction" AS ENUM ('BUY', 'SELL', 'EXIT', 'HOLD');
CREATE TYPE "RiskDecisionType" AS ENUM ('APPROVE', 'RESIZE', 'REJECT');
CREATE TYPE "DecisionCycleStatus" AS ENUM ('CREATED', 'DATA_READY', 'AGENTS_COMPLETE', 'GOVERNED', 'RISK_REVIEWED', 'EXECUTED', 'COMPLETED', 'FAILED', 'CANCELLED');
CREATE TYPE "DecisionMode" AS ENUM ('LIVE_PAPER', 'REPLAY');
CREATE TYPE "ReplayStatus" AS ENUM ('CREATED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'STOPPED');
CREATE TYPE "SystemTradingStatus" AS ENUM ('RUNNING', 'PAUSED', 'RISK_OFF');

CREATE TABLE "Agent" (
  "id" UUID NOT NULL, "type" "AgentType" NOT NULL, "name" TEXT NOT NULL,
  "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE', "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AgentMetric" (
  "id" UUID NOT NULL, "agentId" UUID NOT NULL, "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "trustScore" DECIMAL(6,3) NOT NULL, "pnlPct" DECIMAL(9,4) NOT NULL, "winRate" DECIMAL(6,5) NOT NULL,
  "maxDrawdownPct" DECIMAL(9,4) NOT NULL, "calibrationScore" DECIMAL(6,5) NOT NULL,
  "regimeScore" DECIMAL(6,5) NOT NULL, "executionQuality" DECIMAL(6,5) NOT NULL,
  "sampleSize" INTEGER NOT NULL DEFAULT 0, "source" TEXT NOT NULL DEFAULT 'REPLAY',
  CONSTRAINT "AgentMetric_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AgentAllocation" (
  "id" UUID NOT NULL, "cycleId" UUID NOT NULL, "agentId" UUID NOT NULL, "weight" DECIMAL(7,6) NOT NULL,
  "maxNotionalUsd" DECIMAL(18,4) NOT NULL, "reason" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentAllocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "WatchlistItem" (
  "id" UUID NOT NULL, "symbol" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0, "tags" TEXT[], CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketBar" (
  "id" UUID NOT NULL, "symbol" TEXT NOT NULL, "timeframe" TEXT NOT NULL, "timestamp" TIMESTAMP(3) NOT NULL,
  "open" DECIMAL(18,6) NOT NULL, "high" DECIMAL(18,6) NOT NULL, "low" DECIMAL(18,6) NOT NULL,
  "close" DECIMAL(18,6) NOT NULL, "volume" BIGINT NOT NULL, "vwap" DECIMAL(18,6), "source" TEXT NOT NULL,
  CONSTRAINT "MarketBar_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "IndicatorSnapshot" (
  "id" UUID NOT NULL, "symbol" TEXT NOT NULL, "timestamp" TIMESTAMP(3) NOT NULL,
  "ema20" DECIMAL(18,6), "ema50" DECIMAL(18,6), "rsi14" DECIMAL(10,6), "atr14" DECIMAL(18,6),
  "realizedVol20" DECIMAL(12,8), "zScore20" DECIMAL(12,8), "volumeRatio" DECIMAL(12,8), "relativeStrength" DECIMAL(12,8),
  CONSTRAINT "IndicatorSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MarketRegimeSnapshot" (
  "id" UUID NOT NULL, "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "regime" "MarketRegime" NOT NULL,
  "confidence" DECIMAL(6,5) NOT NULL, "metricsJson" JSONB NOT NULL, "explanation" TEXT NOT NULL,
  CONSTRAINT "MarketRegimeSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "NewsEvent" (
  "id" UUID NOT NULL, "providerId" TEXT, "headline" TEXT NOT NULL, "summary" TEXT NOT NULL, "source" TEXT NOT NULL,
  "url" TEXT NOT NULL, "symbols" TEXT[], "publishedAt" TIMESTAMP(3) NOT NULL, "sentiment" TEXT,
  "materiality" DECIMAL(6,5), "rawJson" JSONB, CONSTRAINT "NewsEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "DecisionCycle" (
  "id" UUID NOT NULL, "mode" "DecisionMode" NOT NULL, "status" "DecisionCycleStatus" NOT NULL DEFAULT 'CREATED',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3), "regimeSnapshotId" UUID,
  "dataAsOf" TIMESTAMP(3), "error" TEXT, "correlationId" TEXT NOT NULL, CONSTRAINT "DecisionCycle_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TradeProposal" (
  "id" UUID NOT NULL, "cycleId" UUID NOT NULL, "agentId" UUID NOT NULL, "symbol" TEXT NOT NULL,
  "action" "ProposalAction" NOT NULL, "confidence" DECIMAL(6,5) NOT NULL, "requestedNotionalUsd" DECIMAL(18,4) NOT NULL,
  "stopPrice" DECIMAL(18,6), "takeProfitPrice" DECIMAL(18,6), "horizonMinutes" INTEGER NOT NULL,
  "thesis" TEXT NOT NULL, "invalidation" TEXT NOT NULL, "evidenceJson" JSONB NOT NULL, "dataAsOf" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TradeProposal_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GovernorDecision" (
  "id" UUID NOT NULL, "cycleId" UUID NOT NULL, "selectedProposalIdsJson" JSONB NOT NULL,
  "rejectedProposalIdsJson" JSONB NOT NULL, "scoresJson" JSONB NOT NULL, "rationale" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GovernorDecision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RiskDecision" (
  "id" UUID NOT NULL, "proposalId" UUID NOT NULL, "decision" "RiskDecisionType" NOT NULL,
  "approvedNotionalUsd" DECIMAL(18,4) NOT NULL, "approvedQty" DECIMAL(18,8), "stopPrice" DECIMAL(18,6),
  "takeProfitPrice" DECIMAL(18,6), "checksJson" JSONB NOT NULL, "rejectionCodesJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RiskDecision_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ExecutionOrder" (
  "id" UUID NOT NULL, "proposalId" UUID NOT NULL, "riskDecisionId" UUID NOT NULL, "alpacaOrderId" TEXT,
  "clientOrderId" TEXT NOT NULL, "symbol" TEXT NOT NULL, "side" TEXT NOT NULL, "type" TEXT NOT NULL, "tif" TEXT NOT NULL,
  "requestedQty" DECIMAL(18,8), "requestedNotional" DECIMAL(18,4), "status" TEXT NOT NULL,
  "filledQty" DECIMAL(18,8) NOT NULL DEFAULT 0, "filledAvgPrice" DECIMAL(18,6), "submittedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL, "lastAlpacaRequestId" TEXT, CONSTRAINT "ExecutionOrder_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PositionSnapshot" (
  "id" UUID NOT NULL, "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "symbol" TEXT NOT NULL,
  "qty" DECIMAL(18,8) NOT NULL, "avgEntryPrice" DECIMAL(18,6) NOT NULL, "marketValue" DECIMAL(18,4) NOT NULL,
  "costBasis" DECIMAL(18,4) NOT NULL, "unrealizedPl" DECIMAL(18,4) NOT NULL, "unrealizedPlPct" DECIMAL(10,6) NOT NULL,
  CONSTRAINT "PositionSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AccountSnapshot" (
  "id" UUID NOT NULL, "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "equity" DECIMAL(18,4) NOT NULL,
  "cash" DECIMAL(18,4) NOT NULL, "buyingPower" DECIMAL(18,4) NOT NULL, "portfolioValue" DECIMAL(18,4) NOT NULL,
  "daytradeCount" INTEGER NOT NULL, "tradingBlocked" BOOLEAN NOT NULL, CONSTRAINT "AccountSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AuditEvent" (
  "id" UUID NOT NULL, "cycleId" UUID, "agentId" UUID, "proposalId" UUID, "orderId" UUID,
  "eventType" TEXT NOT NULL, "severity" TEXT NOT NULL, "message" TEXT NOT NULL, "payloadJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "RiskProfile" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT false, "limitsJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiskProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ReplayRun" (
  "id" UUID NOT NULL, "name" TEXT NOT NULL, "status" "ReplayStatus" NOT NULL DEFAULT 'CREATED',
  "startTime" TIMESTAMP(3) NOT NULL, "endTime" TIMESTAMP(3) NOT NULL, "speed" INTEGER NOT NULL,
  "symbols" TEXT[], "seed" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3), "summaryJson" JSONB, CONSTRAINT "ReplayRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SystemState" (
  "id" TEXT NOT NULL, "tradingStatus" "SystemTradingStatus" NOT NULL DEFAULT 'PAUSED', "paperMode" BOOLEAN NOT NULL DEFAULT true,
  "lastProviderOkAt" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "SystemState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Agent_type_key" ON "Agent"("type");
CREATE INDEX "AgentMetric_agentId_timestamp_idx" ON "AgentMetric"("agentId", "timestamp");
CREATE UNIQUE INDEX "AgentAllocation_cycleId_agentId_key" ON "AgentAllocation"("cycleId", "agentId");
CREATE UNIQUE INDEX "WatchlistItem_symbol_key" ON "WatchlistItem"("symbol");
CREATE INDEX "MarketBar_symbol_timestamp_idx" ON "MarketBar"("symbol", "timestamp");
CREATE UNIQUE INDEX "MarketBar_symbol_timeframe_timestamp_key" ON "MarketBar"("symbol", "timeframe", "timestamp");
CREATE INDEX "IndicatorSnapshot_symbol_timestamp_idx" ON "IndicatorSnapshot"("symbol", "timestamp");
CREATE UNIQUE INDEX "NewsEvent_providerId_key" ON "NewsEvent"("providerId");
CREATE INDEX "NewsEvent_publishedAt_idx" ON "NewsEvent"("publishedAt");
CREATE UNIQUE INDEX "DecisionCycle_correlationId_key" ON "DecisionCycle"("correlationId");
CREATE INDEX "DecisionCycle_startedAt_idx" ON "DecisionCycle"("startedAt");
CREATE INDEX "TradeProposal_cycleId_agentId_idx" ON "TradeProposal"("cycleId", "agentId");
CREATE UNIQUE INDEX "GovernorDecision_cycleId_key" ON "GovernorDecision"("cycleId");
CREATE UNIQUE INDEX "RiskDecision_proposalId_key" ON "RiskDecision"("proposalId");
CREATE UNIQUE INDEX "ExecutionOrder_clientOrderId_key" ON "ExecutionOrder"("clientOrderId");
CREATE INDEX "ExecutionOrder_status_idx" ON "ExecutionOrder"("status");
CREATE INDEX "PositionSnapshot_symbol_timestamp_idx" ON "PositionSnapshot"("symbol", "timestamp");
CREATE INDEX "AccountSnapshot_timestamp_idx" ON "AccountSnapshot"("timestamp");
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");
CREATE INDEX "AuditEvent_eventType_idx" ON "AuditEvent"("eventType");

ALTER TABLE "AgentMetric" ADD CONSTRAINT "AgentMetric_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentAllocation" ADD CONSTRAINT "AgentAllocation_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DecisionCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentAllocation" ADD CONSTRAINT "AgentAllocation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DecisionCycle" ADD CONSTRAINT "DecisionCycle_regimeSnapshotId_fkey" FOREIGN KEY ("regimeSnapshotId") REFERENCES "MarketRegimeSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DecisionCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TradeProposal" ADD CONSTRAINT "TradeProposal_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GovernorDecision" ADD CONSTRAINT "GovernorDecision_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DecisionCycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RiskDecision" ADD CONSTRAINT "RiskDecision_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TradeProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExecutionOrder" ADD CONSTRAINT "ExecutionOrder_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TradeProposal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ExecutionOrder" ADD CONSTRAINT "ExecutionOrder_riskDecisionId_fkey" FOREIGN KEY ("riskDecisionId") REFERENCES "RiskDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "DecisionCycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "TradeProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ExecutionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
