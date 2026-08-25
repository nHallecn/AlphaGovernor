import { NextResponse } from "next/server";
import { alpacaConfigured, alpacaRequest } from "@/lib/alpaca";

export const dynamic = "force-dynamic";

interface AlpacaAccount {
  id: string;
  status: string;
  currency: string;
  buying_power: string;
  cash: string;
  portfolio_value: string;
  equity: string;
  last_equity: string;
  trading_blocked: boolean;
  account_blocked: boolean;
}

export async function GET() {
  if (!alpacaConfigured()) {
    return NextResponse.json({ configured: false, mode: "replay" }, { status: 200 });
  }
  try {
    const account = await alpacaRequest<AlpacaAccount>("/v2/account");
    return NextResponse.json({
      configured: true,
      mode: "paper",
      account: {
        id: account.id,
        status: account.status,
        currency: account.currency,
        buyingPower: Number(account.buying_power),
        cash: Number(account.cash),
        portfolioValue: Number(account.portfolio_value),
        equity: Number(account.equity),
        previousEquity: Number(account.last_equity),
        tradingBlocked: account.trading_blocked || account.account_blocked,
      },
    });
  } catch (error) {
    return NextResponse.json({ configured: true, error: error instanceof Error ? error.message : "Alpaca request failed." }, { status: 502 });
  }
}
