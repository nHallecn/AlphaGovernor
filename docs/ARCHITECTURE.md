# Architecture and safety case

## Design goal

AlphaGovernor governs autonomous strategies instead of treating a single model as a portfolio manager. Authority is separated into proposal, allocation, policy, execution, and audit layers so every capital decision has an owner and evidence trail.

## Runtime boundaries

1. **Specialist agents** produce typed proposals. The demo includes Momentum, News Intelligence, Mean Reversion, and Capital Preservation.
2. **Governor** computes allocation scores from trust × regime compatibility × proposal confidence. A 35% per-agent ceiling is applied independently.
3. **Risk Guardian** is deterministic TypeScript. It validates fresh data, confidence, stops, loss limits, drawdown, buying power, concentration, sector exposure, per-agent authority, and risk at stop.
4. **Alpaca adapter** accepts only the paper hostname and keeps credentials server-side. Orders use a bracket with server-approved quantity, stop, and target.
5. **Auditor** updates trust and calibration from outcomes. The replay event ledger makes the feedback loop visible and reproducible.
6. **AI Auditor** can translate decisions into concise institutional language through schema-constrained output. It cannot call the order route or alter numeric decisions.

## Failure behavior

- No credentials: the product remains fully demonstrable in deterministic replay mode.
- Model failure or missing key: the briefing endpoint returns a labeled deterministic fallback.
- Stale or malformed proposal: the Risk Guardian rejects before the Alpaca adapter is called.
- Daily loss or drawdown breach: all new proposals are rejected.
- Oversized request: a modest excess is clamped; a material excess is rejected and requires resubmission.
- Non-paper Alpaca URL: server startup requests fail closed.

## Production path

For a production pilot, replace the in-browser replay store with PostgreSQL event sourcing, add Alpaca trade-update streaming, sector/position snapshots sourced server-side, signed decision records, identity/roles, idempotency storage, a kill switch, monitoring, and compliance review. The hackathon build intentionally prioritizes one trustworthy autonomous loop.
