import "server-only";
import type { Asset } from "./types";

/**
 * Bitrefill Personal API (v2). Gift cards for food delivery, retail, travel,
 * games and more, paid in USDC or SOL on Solana from the Privacy Ring.
 *
 * Verified against the live API (2026-11-21):
 *  - account prices are in the account's primary currency (BTC sats here), so
 *    search results are converted to USD for display only;
 *  - `POST /invoices` with `usdc_solana` / `solana` returns the exact amount
 *    to send (`payment.amount`), the Solana address, `price_usd`, and a
 *    60-minute expiry. The invoice amount, not the estimate, is what's charged.
 */

const BASE = "https://api.bitrefill.com/v2";

export const bitrefillEnabled = () => Boolean(process.env.BITREFILL_API_KEY);

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.BITREFILL_API_KEY}`, "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (body.message as string) ?? (body.error as string) ?? `HTTP ${res.status}`;
    throw new Error(`Bitrefill: ${msg}${body.error_code ? ` (${body.error_code})` : ""}`);
  }
  return body as T;
}

// --- Pricing ------------------------------------------------------------------

const g = globalThis as unknown as { __priviFx?: { at: number; btcUsd: number; usdPer: Record<string, number> } };

/** USD per unit of the account currency (BTC sats → USD, or fiat). Cached 5 min. */
async function fx(): Promise<{ btcUsd: number; usdPer: Record<string, number> }> {
  if (g.__priviFx && Date.now() - g.__priviFx.at < 300_000) return g.__priviFx;
  const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,eur", { signal: AbortSignal.timeout(5000), cache: "no-store" });
  const j = (await r.json()) as { bitcoin?: { usd?: number; eur?: number } };
  const btcUsd = j.bitcoin?.usd ?? 0;
  const eurUsd = j.bitcoin?.usd && j.bitcoin?.eur ? j.bitcoin.usd / j.bitcoin.eur : 1.08;
  g.__priviFx = { at: Date.now(), btcUsd, usdPer: { USD: 1, EUR: eurUsd, BTC: btcUsd / 1e8 } };
  return g.__priviFx;
}

let accountCurrency: string | null = null;
async function priceToUsd(price: number): Promise<number> {
  if (!accountCurrency) {
    const b = await call<{ data: { currency: string } }>("/accounts/balance");
    accountCurrency = b.data.currency; // e.g. "BTC" (prices in sats), "USD", "EUR"
  }
  const { usdPer } = await fx();
  return price * (usdPer[accountCurrency] ?? 1);
}

// --- Products -----------------------------------------------------------------

interface BrPackage { id: string; value: string; price: number }
interface BrProduct {
  id: string;
  name: string;
  country_code: string;
  currency: string;
  in_stock: boolean;
  packages?: BrPackage[] | BrPackage;
}

export interface GiftCardOffer {
  productId: string;
  packageId: string;
  name: string;
  country: string;
  faceValue: number;
  faceCurrency: string;
  /** Estimated USD cost; the invoice gives the exact charge. */
  priceUsd: number;
}

/**
 * Search gift cards. Prefers the given country (default US), in-stock only,
 * and returns packages closest to the requested face value.
 */
export async function searchGiftCards(q: { brand: string; amountUsd?: number; country?: string }): Promise<GiftCardOffer[]> {
  const country = (q.country ?? "US").toUpperCase();
  const res = await call<{ data: BrProduct[] }>(`/products/search?q=${encodeURIComponent(q.brand)}&limit=20`);
  const products = res.data.filter((p) => p.in_stock && p.country_code === country);
  const out: GiftCardOffer[] = [];
  for (const p of products.slice(0, 2)) {
    const pkgs = Array.isArray(p.packages) ? p.packages : p.packages ? [p.packages] : [];
    const sorted = [...pkgs].sort((a, b) => {
      if (!q.amountUsd) return Number(a.value) - Number(b.value);
      return Math.abs(Number(a.value) - q.amountUsd) - Math.abs(Number(b.value) - q.amountUsd);
    });
    for (const k of sorted.slice(0, 3)) {
      out.push({
        productId: p.id,
        packageId: k.id,
        name: p.name,
        country: p.country_code,
        faceValue: Number(k.value),
        faceCurrency: p.currency,
        priceUsd: Math.round((await priceToUsd(k.price)) * 100) / 100,
      });
    }
  }
  return out.slice(0, 3);
}

// --- Invoices & orders --------------------------------------------------------

export interface BrInvoice {
  id: string;
  status: string; // unpaid | payment_detected | payment_confirmed | pending | complete | denied | payment_error | ...
  payment: { method: string; address: string; currency: string; amount: string; price_usd?: number; expires_at?: string; status: string };
  orders: { id: string; status: string }[];
}

const METHOD: Record<Asset, string> = { USDC: "usdc_solana", SOL: "solana" };

export async function createInvoice(o: { productId: string; packageId: string; asset: Asset }): Promise<BrInvoice> {
  const res = await call<{ data: BrInvoice }>("/invoices", {
    method: "POST",
    body: JSON.stringify({ products: [{ product_id: o.productId, package_id: o.packageId, quantity: 1 }], payment_method: METHOD[o.asset] }),
  });
  const inv = res.data;
  if (!inv.payment?.address || !inv.payment?.amount) throw new Error("Bitrefill returned an invoice without payment details.");
  return inv;
}

export async function getInvoice(id: string): Promise<BrInvoice> {
  return (await call<{ data: BrInvoice }>(`/invoices/${encodeURIComponent(id)}`)).data;
}

export interface Redemption {
  code?: string;
  pin?: string;
  link?: string;
  instructions?: string;
}

/** Redemption info once an order is delivered. Handles both documented shapes. */
export async function getRedemption(orderId: string): Promise<{ status: string; redemption?: Redemption }> {
  const o = (await call<{ data: { status: string; redemption_info?: unknown } }>(`/orders/${encodeURIComponent(orderId)}`)).data;
  const r = o.redemption_info;
  if (!r) return { status: o.status };
  if (typeof r === "string") return { status: o.status, redemption: { instructions: r } };
  const x = r as Record<string, unknown>;
  return {
    status: o.status,
    redemption: {
      code: x.code as string | undefined,
      pin: x.pin as string | undefined,
      link: x.link as string | undefined,
      instructions: x.instructions as string | undefined,
    },
  };
}
