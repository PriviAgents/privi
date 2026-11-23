import "server-only";
import type { Asset, SessionState } from "./types";
import { DEMO_PRICES } from "./store";

/**
 * Live spot prices (USD) with a short server-side cache. CoinGecko's public
 * endpoint needs no key; if it is unreachable we keep serving the last good
 * value (or the static fallback) and flag it as stale.
 */
export interface PriceSnapshot {
  prices: Record<Asset, number>;
  updatedAt: string;
  source: "coingecko" | "fallback";
  stale: boolean;
}

const TTL_MS = 10_000; // matches the dashboard poll; well inside CoinGecko's free limit per instance
const URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=usd";

const g = globalThis as unknown as { __priviPrices?: PriceSnapshot & { fetchedAt: number } };

export async function getPrices(): Promise<PriceSnapshot> {
  const cached = g.__priviPrices;
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached;
  try {
    const { kv } = await import("./kv");
    const shared = await kv.get<PriceSnapshot & { fetchedAt: number }>("px:snapshot");
    if (shared && !shared.stale && Date.now() - shared.fetchedAt < TTL_MS) {
      g.__priviPrices = shared;
      return shared;
    }
  } catch {
    /* fall through to the feed */
  }

  try {
    const res = await fetch(URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`coingecko ${res.status}`);
    const j = (await res.json()) as Record<string, { usd?: number }>;
    const sol = j.solana?.usd;
    if (!sol) throw new Error("coingecko: missing fields");
    const snap = {
      prices: { SOL: sol, USDC: j["usd-coin"]?.usd ?? 1 },
      updatedAt: new Date().toISOString(),
      source: "coingecko" as const,
      stale: false,
      fetchedAt: Date.now(),
    };
    g.__priviPrices = snap;
    await import("./kv").then(({ kv }) => kv.set("px:snapshot", snap, 60)).catch(() => {});
    return snap;
  } catch (e) {
    if (cached) {
      // Serve last good value for up to 10 minutes, then still serve it but stale.
      const stale = { ...cached, stale: true, fetchedAt: Date.now() - TTL_MS + 15_000 };
      g.__priviPrices = stale;
      return stale;
    }
    console.warn("[privi] price fetch failed, using fallback:", (e as Error).message);
    const fallback = {
      prices: { ...DEMO_PRICES },
      updatedAt: new Date().toISOString(),
      source: "fallback" as const,
      stale: true,
      fetchedAt: Date.now() - TTL_MS + 15_000, // retry soon
    };
    g.__priviPrices = fallback;
    return fallback;
  }
}

/** Refresh the session's wallet prices from the live feed. */
export async function applyPrices(s: SessionState): Promise<PriceSnapshot> {
  const snap = await getPrices();
  s.wallet.prices = { ...snap.prices };
  s.wallet.updatedAt = new Date().toISOString();
  return snap;
}
