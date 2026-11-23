import "server-only";
import { getBase64Encoder, getTransactionDecoder } from "@solana/kit";
import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { withLock } from "./kv";
import {
  ensureSpendReady,
  payFromRing,
  rpcUrl,
  sendSigned,
  spendBalances,
  spendSigner,
  usdcMint,
  type RingAsset,
} from "./rings";

/**
 * Zinc: real orders at Amazon, Walmart, Target, Best Buy and other retailers,
 * paid per order over x402 in USDC on Solana. No Zinc account: the paid
 * response returns an API key for following that one order.
 *
 *   ring ──withdraw──▶ spend wallet ──x402 USDC──▶ Zinc ──▶ retailer
 *
 * Zinc charges max_price + $1 up front and refunds whatever the retailer total
 * doesn't use (and everything on a failed order) back to the spend wallet. The
 * user's ledger gets the same refund in USDC when the order settles.
 *
 * Verified against the live API (2026-11-21): the 402 offers
 * `exact` / solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp / USDC with a facilitator
 * fee payer; test mode is not available on /agent/orders.
 */

const API = "https://api.zinc.com";
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const JUP = "https://lite-api.jup.ag/swap/v1";
const SOL_MINT = "So11111111111111111111111111111111111111112";
export const ZINC_FEE_USD = 1;
/** USDC kept on the spend wallet for $0.01 product searches; orders never draw it down. */
export const SEARCH_FLOAT_USD = 2;
/** Buffer kept on the spend wallet beyond the order being paid, and the top-up lot sizes. */
const SPEND_FLOAT_USD = Number(process.env.PRIVI_SPEND_FLOAT_USD ?? 50);
const USDC_LOT = 25;
const SOL_LOT = 0.25;
const SOL_GAS_RESERVE = 0.012;

export const zincEnabled = () => process.env.PRIVI_ZINC_DISABLED !== "1";

export interface ShippingAddress {
  first_name: string;
  last_name: string;
  address_line1: string;
  address_line2?: string | null;
  city: string;
  state?: string | null;
  postal_code: string;
  country: string;
  phone_number: string;
}

// --- Catalog checks -------------------------------------------------------------

export interface RetailerCheck {
  orderable: boolean;
  retailer: string;
  shipsTo: string[];
}

/** Free: can Zinc buy from this product URL, and where does it ship? */
export async function checkRetailer(url: string): Promise<RetailerCheck> {
  const r = await fetch(`${API}/retailers/check?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!r.ok) throw new Error("Couldn't check that store right now.");
  const j = (await r.json()) as { orderable?: boolean; retailer?: { display_name?: string } | null; domain?: string; ships_to?: string[] };
  return { orderable: Boolean(j.orderable), retailer: j.retailer?.display_name ?? j.domain ?? "Retailer", shipsTo: j.ships_to ?? [] };
}

/**
 * Cap for the retailer total (product + tax + shipping), in whole dollars.
 * Unused budget is refunded, so the cap leans generous: 12% for tax plus a
 * shipping allowance.
 */
export function maxPriceUsd(itemUsd: number, quantity: number): number {
  return Math.ceil(itemUsd * quantity * 1.12 + 8);
}

// --- SOL → USDC (Jupiter) ---------------------------------------------------------

interface JupQuote { inAmount: string; outAmount: string; otherAmountThreshold: string; [k: string]: unknown }

/** Quote: the most SOL needed to receive exactly `usdc` USDC (incl. slippage). */
export async function quoteSolForUsdc(usdc: number): Promise<{ solMax: number; quote: JupQuote }> {
  const out = Math.round(usdc * 1e6);
  const r = await fetch(
    `${JUP}/quote?inputMint=${SOL_MINT}&outputMint=${usdcMint()}&amount=${out}&swapMode=ExactOut&slippageBps=100`,
    { signal: AbortSignal.timeout(10_000), cache: "no-store" },
  );
  if (!r.ok) throw new Error("Couldn't price the SOL to USDC conversion right now.");
  const quote = (await r.json()) as JupQuote;
  return { solMax: Number(quote.otherAmountThreshold) / 1e9, quote };
}

async function swapOnSpendWallet(quote: JupQuote): Promise<string> {
  const signer = await spendSigner();
  const r = await fetch(`${JUP}/swap`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quoteResponse: quote, userPublicKey: signer.address, wrapAndUnwrapSol: true, dynamicComputeUnitLimit: true, prioritizationFeeLamports: "auto" }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json()) as { swapTransaction?: string; error?: string };
  if (!r.ok || !j.swapTransaction) throw new Error(`Conversion failed: ${j.error ?? r.status}`);
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(j.swapTransaction));
  return sendSigned(tx, [signer]);
}

/**
 * Ensure the spend wallet holds at least `usdcNeeded` USDC, moving only the
 * shortfall out of the ring: USDC directly, or SOL converted through Jupiter.
 * `solBudget` is the most SOL the user approved for a SOL-paid order.
 */
export async function fundSpend(usdcNeeded: number, payAsset: RingAsset, solBudget: number): Promise<string[]> {
  const sigs: string[] = [];
  await ensureSpendReady();
  const raw = (await spendBalances()).usdc;
  const reserved = Math.min(SEARCH_FLOAT_USD, raw); // left untouched for searches
  const have = raw - reserved;
  const shortfall = Math.ceil((usdcNeeded - have) * 1e6) / 1e6;
  if (shortfall <= 0) return sigs;
  const to = (await spendSigner()).address;

  // Privacy: ring withdrawals should not mirror individual orders. Top up in
  // round lots that include a standing buffer, so withdrawal amounts don't
  // match purchases and most purchases need no withdrawal at all. If the ring
  // can't cover a rounded lot, fall back to the exact amount.
  const withdraw = async (asset: RingAsset, exact: number, lot: number, buffer: number) => {
    const rounded = Math.ceil((exact + buffer) / lot) * lot;
    try {
      return (await payFromRing({ to, asset, amount: rounded })).signature;
    } catch {
      return (await payFromRing({ to, asset, amount: Math.ceil(exact * 1e6) / 1e6 })).signature;
    }
  };

  if (payAsset === "USDC") {
    sigs.push(await withdraw("USDC", shortfall, USDC_LOT, SPEND_FLOAT_USD));
    return sigs;
  }
  const { solMax, quote } = await quoteSolForUsdc(shortfall);
  if (solMax > solBudget + 1e-9) throw new Error("SOL moved since you approved. Ask Privi to prepare the order again.");
  const solOnHand = Math.max(0, (await spendBalances()).sol - SOL_GAS_RESERVE);
  if (solOnHand + 1e-9 < solMax) sigs.push(await withdraw("SOL", solMax - solOnHand, SOL_LOT, 0));
  sigs.push(await swapOnSpendWallet(quote));
  const after = (await spendBalances()).usdc;
  if (after + 1e-6 < usdcNeeded + reserved) throw new Error("The conversion came up short. Nothing was ordered; try again.");
  return sigs;
}

// --- Live product search ($0.01 per call) ---------------------------------------

export interface ProductHit {
  title: string;
  retailer: string;
  url: string;
  priceUsd: number;
  image?: string;
  rating?: number;
  reviews?: number;
  freeShipping?: boolean;
}

/**
 * Search live retailer catalogs (Amazon, Walmart, Target, Best Buy…). Every
 * result is a current, orderable listing with a real URL, which web search
 * can't promise. Paid from the spend wallet's search float.
 */
export async function searchProducts(q: { query: string; maxPriceUsd?: number | null; retailer?: string | null }): Promise<ProductHit[]> {
  const params = new URLSearchParams({ q: q.query, limit: "12", method: "x402" });
  if (q.retailer) params.append("retailer", q.retailer.toLowerCase());
  const url = `${API}/agent/search?${params}`;
  const first = await fetch(url, { method: "POST", signal: AbortSignal.timeout(15_000) });
  if (first.status !== 402) throw new Error(await zincError(first));
  const required = decodePaymentRequiredHeader(first.headers.get("payment-required") ?? "");
  const accept = required.accepts.find((a) => a.network === SOLANA_MAINNET && a.scheme === "exact");
  if (!accept || accept.asset !== usdcMint() || BigInt(accept.amount) > BigInt(20_000)) {
    throw new Error("Product search pricing changed. Using web search instead.");
  }
  if ((await spendBalances()).usdc < 0.05) throw new Error("Product search is temporarily unavailable (search float is empty).");
  const client = new x402Client()
    .register(SOLANA_MAINNET, new ExactSvmScheme(await spendSigner(), { rpcUrl: rpcUrl() }))
    .setSpendControls({ maxAmountPerPayment: "$0.02" });
  const payload = await client.createPaymentPayload({ ...required, accepts: [accept] });
  const paid = await fetch(url, { method: "POST", headers: { "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) }, signal: AbortSignal.timeout(30_000) });
  if (!paid.ok) throw new Error(await zincError(paid));
  const j = (await paid.json()) as {
    results?: { url: string; retailer: string; title: string; price?: number | null; image?: string | null; stars?: number | null; num_reviews?: number | null; available?: boolean | null; free_shipping?: boolean | null }[];
  };
  return (j.results ?? [])
    .filter((r) => r.url && r.title && typeof r.price === "number" && r.available !== false)
    .map((r) => ({
      title: r.title,
      retailer: r.retailer,
      url: r.url,
      priceUsd: (r.price as number) / 100,
      image: r.image ?? undefined,
      rating: r.stars ?? undefined,
      reviews: r.num_reviews ?? undefined,
      freeShipping: r.free_shipping ?? undefined,
    }))
    .filter((r) => !q.maxPriceUsd || r.priceUsd <= q.maxPriceUsd)
    .slice(0, 6);
}

// --- Ordering ---------------------------------------------------------------------

export interface ZincOrderRequest {
  idempotencyKey: string;
  url: string;
  quantity: number;
  maxPriceCents: number;
  shipping: ShippingAddress;
}

export interface ZincPlaced {
  zincOrderId: string;
  status: string;
  fundingSignatures: string[];
}

/** Thrown when Zinc refused the order before taking payment. */
export class ZincRejected extends Error {}

function orderBody(o: ZincOrderRequest) {
  return JSON.stringify({
    products: [{ url: o.url, quantity: o.quantity }],
    max_price: o.maxPriceCents,
    shipping_address: o.shipping,
    idempotency_key: o.idempotencyKey,
  });
}

async function zincError(r: Response): Promise<string> {
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: string } | string; message?: string };
  const e = typeof j.error === "string" ? j.error : j.error?.message;
  return e ?? j.message ?? `Zinc returned ${r.status}`;
}

/**
 * Place a paid order. Every check that can fail without money moving runs
 * first (body validation, the 402 amount); funding then happens under one
 * lock so concurrent orders don't spend each other's float.
 */
export async function placeOrder(o: ZincOrderRequest, pay: { asset: RingAsset; solBudget: number }): Promise<ZincPlaced> {
  const url = `${API}/agent/orders?method=x402`;
  const headers = { "content-type": "application/json" };

  // 1. Challenge (validates the body; nothing is charged).
  const first = await fetch(url, { method: "POST", headers, body: orderBody(o), signal: AbortSignal.timeout(20_000) });
  if (first.status !== 402) throw new ZincRejected(await zincError(first));
  const header = first.headers.get("payment-required");
  if (!header) throw new ZincRejected("Zinc didn't return payment terms.");
  const required = decodePaymentRequiredHeader(header);
  const accept = required.accepts.find((a) => a.network === SOLANA_MAINNET && a.scheme === "exact");
  if (!accept) throw new ZincRejected("Zinc isn't accepting Solana payments right now.");
  // Never pay more than the approved cap plus Zinc's fee, in the right token.
  const expected = BigInt(Math.round(o.maxPriceCents) + Math.round(ZINC_FEE_USD * 100)) * BigInt(10_000);
  if (accept.asset !== usdcMint() || !/^\d{1,20}$/.test(String(accept.amount)) || BigInt(accept.amount) !== expected) {
    throw new ZincRejected("Zinc asked for an unexpected amount. Nothing was paid.");
  }
  const usdcNeeded = Number(expected) / 1e6;

  return withLock("spend-wallet", async () => {
    // 2. Fund the spend wallet from the ring.
    const fundingSignatures = await fundSpend(usdcNeeded, pay.asset, pay.solBudget);

    // 3. Sign the x402 payment and resubmit.
    // The client's own spend cap is set to exactly this order's approved amount.
    const client = new x402Client()
      .register(SOLANA_MAINNET, new ExactSvmScheme(await spendSigner(), { rpcUrl: rpcUrl() }))
      .setSpendControls({ maxAmountPerPayment: `$${usdcNeeded.toFixed(2)}` });
    const payload = await client.createPaymentPayload({ ...required, accepts: [accept] });
    const paid = await fetch(url, {
      method: "POST",
      headers: { ...headers, "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
      body: orderBody(o),
      signal: AbortSignal.timeout(45_000),
    });

    if (paid.status === 201 || paid.status === 409) {
      const key = paid.headers.get("x-api-key");
      const j = (await paid.json().catch(() => ({}))) as { id?: string; status?: string; error?: { details?: { order_id?: string } } };
      const id = j.id ?? j.error?.details?.order_id;
      if (!id) throw new Error("Zinc took the order but didn't return its id. Contact support.");
      if (key) await import("./kv").then(({ kv }) => kv.set(`zinc:key:${id}`, key));
      return { zincOrderId: id, status: j.status ?? "pending", fundingSignatures };
    }
    // 400 here is checked before the payment is charged: the USDC stays on the spend wallet.
    if (paid.status === 400 || paid.status === 422) throw new ZincRejected(await zincError(paid));
    throw new Error(`Payment wasn't confirmed (${await zincError(paid)}). Ask Privi to check the order.`);
  });
}

// --- Status -----------------------------------------------------------------------

export interface ZincStatus {
  status: string; // pending | in_progress | order_placed | order_failed | cancelled | cancelled_by_retailer
  totalCents?: number;
  error?: string;
  merchantOrderIds: string[];
  tracking: { carrier: string; number: string; url?: string; status?: string }[];
  estimatedDelivery?: string;
}

export async function getOrder(zincOrderId: string): Promise<ZincStatus> {
  const { kv } = await import("./kv");
  const key = await kv.get<string>(`zinc:key:${zincOrderId}`);
  if (!key) throw new Error("Order credentials missing.");
  const r = await fetch(`${API}/orders/${encodeURIComponent(zincOrderId)}`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  if (!r.ok) throw new Error(await zincError(r));
  const o = (await r.json()) as {
    status: string;
    merchant_order_ids?: string[];
    tracking_numbers?: { carrier: string; tracking_number: string; zinc_tracking_url?: string | null; status?: string | null }[];
    job_result?: { error?: string | null; price_components?: { total?: number | null } | null; estimated_delivery?: string | null } | null;
  };
  return {
    status: o.status,
    totalCents: o.job_result?.price_components?.total ?? undefined,
    error: o.job_result?.error ?? undefined,
    merchantOrderIds: o.merchant_order_ids ?? [],
    tracking: (o.tracking_numbers ?? []).map((t) => ({ carrier: t.carrier, number: t.tracking_number, url: t.zinc_tracking_url ?? undefined, status: t.status ?? undefined })),
    estimatedDelivery: o.job_result?.estimated_delivery ?? undefined,
  };
}
