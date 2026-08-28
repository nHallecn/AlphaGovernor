import { NextResponse } from "next/server";

export async function POST() {
  const apiBase = process.env.API_BASE_URL ?? "http://localhost:4000";
  const token = process.env.OPERATOR_TOKEN;
  if (!token) return NextResponse.json({ error: "Server operator token is not configured." }, { status: 503 });
  const response = await fetch(`${apiBase}/api/v1/replays`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-operator-token": token },
    body: JSON.stringify({ name: "Live hackathon proof replay", speed: 50, seed: 42 }), cache: "no-store",
  });
  return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
}
