# Architecture and safety case

## Authority model

AlphaGovernor separates reasoning, capital allocation, risk approval, execution, and audit. No strategy agent holds credentials or can call a trading provider. The sole execution path is:

`TradeProposal → GovernorDecision → RiskDecision → ExecutionOrder(PENDING_SUBMIT) → ExecutionService → Alpaca Paper`

In live-paper mode, PostgreSQL must durably contain the cycle, proposal, Governor decision, Risk decision, and pending execution row before provider submission. The unique `client_order_id` is derived from the Risk decision and attempt number. A timeout produces an unknown state and forces reconciliation; it never triggers a blind retry.

## Runtime layers

1. Adapters return normalized bars, news, account, positions, orders, and clock state.
2. Deterministic code computes EMA20/50, RSI14, ATR14, volatility, z-score, volume ratio, relative strength, and regime.
3. Momentum, Mean Reversion, News, and Defensive agents emit a shared proposal contract or abstain.
4. News uses strict structured AI output; any timeout or invalid output becomes abstention.
5. Governor code combines trust, regime fit, confidence, reward/risk, freshness, conflicts, status, and allocation caps.
6. Risk checks mode, system state, clock, freshness, universe, tradability, confidence, losses, drawdown, positions, orders, concentration, buying power, stops, targets, and sizing.
7. ExecutionService alone submits paper orders or creates replay fills.
8. PostgreSQL audit and SSE make each state change inspectable by cycle, agent, proposal, risk decision, and order.

## Failure behavior

- Database uncertainty blocks live-paper execution.
- Account, position, clock, price, or tradability uncertainty rejects the proposal.
- AI failure, malformed schema, injection attempt, or missing key causes abstention.
- Provider placement timeout reconciles by `client_order_id`; no blind retry.
- Risk breach or emergency kill moves the system to `RISK_OFF`, stops entries, and cancels open paper orders.
- Replay uses shared decision code with replay adapters and cannot call Alpaca execution.
- Credentials and authorization headers never enter audit payloads or logs.

## Data model

PostgreSQL persists agents and metrics, allocations, watchlist, bars and indicators, regimes and news, cycles and proposals, Governor/Risk decisions, orders, account/position snapshots, replays, risk profiles, system state, and audit events. Persisted money uses Decimal columns; number conversion happens at provider and UI boundaries.
