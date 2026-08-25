import "server-only";

const DEFAULT_PAPER_URL = "https://paper-api.alpaca.markets";

export function alpacaConfigured(): boolean {
  return Boolean(process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET);
}

function paperBaseUrl(): string {
  const configured = process.env.ALPACA_PAPER_BASE_URL || DEFAULT_PAPER_URL;
  const parsed = new URL(configured);
  if (parsed.protocol !== "https:" || parsed.hostname !== "paper-api.alpaca.markets") {
    throw new Error("AlphaGovernor only permits the Alpaca paper-trading endpoint.");
  }
  return parsed.origin;
}

export async function alpacaRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!alpacaConfigured()) throw new Error("Alpaca paper credentials are not configured.");
  const response = await fetch(`${paperBaseUrl()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "APCA-API-KEY-ID": process.env.ALPACA_API_KEY!,
      "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET!,
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Alpaca ${response.status}: ${message.slice(0, 240)}`);
  }
  return response.json() as Promise<T>;
}
