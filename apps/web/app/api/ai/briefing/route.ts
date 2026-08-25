import { NextResponse } from "next/server";
import { z } from "zod";

const inputSchema = z.object({
  regime: z.object({ label: z.string().max(80), confidence: z.number().min(0).max(100), volatility: z.string().max(30) }),
  portfolio: z.object({ value: z.number(), pnlPct: z.number(), drawdown: z.number(), cashPct: z.number() }),
  lastDecision: z.object({ headline: z.string().max(160), summary: z.string().max(500), reasons: z.array(z.string().max(180)).max(6) }),
  agents: z.array(z.object({ name: z.string().max(80), trust: z.number().min(0).max(100), status: z.string().max(30), allocation: z.number() })).max(8),
});

const outputSchema = {
  type: "object",
  properties: {
    headline: { type: "string" },
    summary: { type: "string" },
    reasons: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 3 },
    posture: { type: "string", enum: ["RISK_ON", "BALANCED", "DEFENSIVE"] },
  },
  required: ["headline", "summary", "reasons", "posture"],
  additionalProperties: false,
} as const;

function deterministicBriefing(input: z.infer<typeof inputSchema>) {
  const weakest = [...input.agents].sort((a, b) => a.trust - b.trust)[0];
  return {
    mode: "deterministic",
    briefing: {
      headline: input.lastDecision.headline,
      summary: input.lastDecision.summary,
      reasons: input.lastDecision.reasons.slice(0, 3),
      posture: input.regime.volatility === "HIGH" || input.portfolio.cashPct >= 20 ? "DEFENSIVE" : "BALANCED",
    },
    note: `Model key not configured. Deterministic Governor retained; ${weakest?.name ?? "the weakest agent"} has the lowest trust.`,
  };
}

export async function POST(request: Request) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid briefing context." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json(deterministicBriefing(parsed.data));

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5.5",
        store: false,
        instructions: "You are the AlphaGovernor auditor. Explain the supplied deterministic decision in concise institutional language. Never propose or place a trade, change a number, invent evidence, or claim to override the Risk Constitution.",
        input: JSON.stringify(parsed.data),
        text: { format: { type: "json_schema", name: "governor_briefing", strict: true, schema: outputSchema }, verbosity: "low" },
      }),
    });
    if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 180)}`);
    const payload = await response.json() as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
    const text = payload.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
    if (!text) throw new Error("Model returned no briefing text.");
    return NextResponse.json({ mode: "model", briefing: JSON.parse(text) });
  } catch (error) {
    return NextResponse.json({ ...deterministicBriefing(parsed.data), fallbackReason: error instanceof Error ? error.message : "Model request failed." });
  }
}
