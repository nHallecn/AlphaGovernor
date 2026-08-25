# AlphaGovernor engineering rules

- This repository is paper-trading only. Fail closed when provider, account, position, database, or risk state is uncertain.
- No strategy agent may call trading execution directly. Only `ExecutionService` can use a trading provider.
- Every execution must reference persisted Governor and Risk decisions.
- Use Decimal for persisted money and deliberate numeric conversions at provider boundaries.
- Indicators, regime classification, trust, allocation, ranking, risk, sizing, and P&L are deterministic code—not model output.
- Invalid or unavailable AI output becomes an abstention, never a guessed trade.
- Provider timeouts around order placement require reconciliation by `client_order_id`; never retry blindly.
- Audit every state-changing financial decision. Never log credentials or authorization headers.
- Replay reuses the same decision, Governor, and Risk code with replay clock/data/execution adapters and must never call Alpaca execution.
- Tests are part of each feature. Keep typecheck, lint, tests, and builds green.

## Next.js workspace

Before changing `apps/web`, read the relevant bundled Next.js 16 guide in `node_modules/next/dist/docs/` because this version contains breaking changes.
