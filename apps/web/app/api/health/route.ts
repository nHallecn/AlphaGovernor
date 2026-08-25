import { NextResponse } from "next/server";
import { alpacaConfigured } from "@/lib/alpaca";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    app: "AlphaGovernor",
    mode: alpacaConfigured() ? "paper" : "replay",
    alpaca: alpacaConfigured(),
    ai: Boolean(process.env.OPENAI_API_KEY),
    riskConstitution: "locked",
    timestamp: new Date().toISOString(),
  });
}
