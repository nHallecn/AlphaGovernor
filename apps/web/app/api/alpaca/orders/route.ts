import { NextResponse } from "next/server";
import { z } from "zod";
import { alpacaConfigured, alpacaRequest } from "@/lib/alpaca";
import { evaluateRisk } from "@/lib/engine/risk";

const requestSchema = z.object({
  proposal: z.object({
    id: z.string().min(1).max(48),
    agentId: z.enum(["momentum", "news", "reversion", "defensive"]),
    symbol: z.string().regex(/^[A-Z.]{1,10}$/),
    side: z.enum(["buy", "sell"]),
    confidence: z.number().min(0).max(1),
    requestedCapital: z.number().positive().max(100_000),
    currentPositionValue: z.number().min(0),
    entryPrice: z.number().positive(),
    stopLoss: z.number().positive().nullable(),
    takeProfit: z.number().positive().nullable(),
    evidence: z.array(z.string().min(1).max(180)).min(1).max(8),
    marketDataAgeSeconds: z.number().min(0),
  }),
  context: z.object({
    equity: z.number().positive(),
    buyingPower: z.number().min(0),
    dailyPnlPct: z.number(),
    portfolioDrawdownPct: z.number().min(0),
    agentCapital: z.number().min(0),
    sectorExposure: z.number().min(0),
  }),
  confirmPaperExecution: z.literal(true),
});

export async function POST(request: Request) {
  if (!alpacaConfigured()) {
    return NextResponse.json({ error: "Alpaca paper credentials are not configured." }, { status: 503 });
  }
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid order proposal.", issues: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { proposal, context } = parsed.data;
    const [account, positions] = await Promise.all([
      alpacaRequest<{ equity: string; last_equity: string; buying_power: string; trading_blocked: boolean; account_blocked: boolean }>("/v2/account"),
      alpacaRequest<Array<{ symbol: string; market_value: string }>>("/v2/positions"),
    ]);
    if (account.trading_blocked || account.account_blocked) {
      return NextResponse.json({ submitted: false, error: "The Alpaca paper account is blocked from trading." }, { status: 423 });
    }

    const alpacaEquity = Number(account.equity);
    const lastEquity = Number(account.last_equity);
    const derivedDailyPnl = lastEquity > 0 ? ((alpacaEquity - lastEquity) / lastEquity) * 100 : 0;
    const alpacaPositionValue = Math.abs(Number(positions.find((position) => position.symbol === proposal.symbol)?.market_value ?? 0));
    const protectedProposal = { ...proposal, currentPositionValue: Math.max(proposal.currentPositionValue, alpacaPositionValue) };
    const protectedContext = {
      ...context,
      equity: Math.min(context.equity, alpacaEquity),
      buyingPower: Math.min(context.buyingPower, Number(account.buying_power)),
      dailyPnlPct: Math.min(context.dailyPnlPct, derivedDailyPnl),
    };
    const riskDecision = evaluateRisk(protectedProposal, protectedContext);
    if (riskDecision.decision === "REJECT") {
      return NextResponse.json({ submitted: false, riskDecision }, { status: 409 });
    }

    const quantity = Math.floor(riskDecision.approvedCapital / proposal.entryPrice);
    if (quantity < 1) {
      return NextResponse.json({ submitted: false, error: "Approved capital is insufficient for one whole share.", riskDecision }, { status: 409 });
    }
    const order = await alpacaRequest<Record<string, unknown>>("/v2/orders", {
      method: "POST",
      body: JSON.stringify({
        symbol: proposal.symbol,
        qty: String(quantity),
        side: proposal.side,
        type: "market",
        time_in_force: "day",
        order_class: "bracket",
        take_profit: { limit_price: String(proposal.takeProfit) },
        stop_loss: { stop_price: String(proposal.stopLoss) },
        client_order_id: `ag-${proposal.agentId}-${proposal.id}`.slice(0, 48),
      }),
    });
    return NextResponse.json({ submitted: true, environment: "paper", riskDecision, order });
  } catch (error) {
    return NextResponse.json({ submitted: false, error: error instanceof Error ? error.message : "Order submission failed." }, { status: 502 });
  }
}
