import { NextResponse } from "next/server";
import { z } from "zod";

export async function POST(request: Request) {
  const { action } = z.object({ action: z.enum(["pause", "resume", "kill"]) }).parse(await request.json());
  const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000";
  const token = process.env.OPERATOR_TOKEN;
  if (!token) return NextResponse.json({ error: "Server operator token is not configured." }, { status: 503 });
  const response = await fetch(`${apiBase}/api/v1/system/${action}`, { method: "POST", headers: { "x-operator-token": token }, cache: "no-store" });
  return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
}
