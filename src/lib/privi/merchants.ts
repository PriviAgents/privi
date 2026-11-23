import "server-only";
import type { Asset, Order, OrderKind, SessionState } from "./types";
import { newId, pushActivity } from "./store";
import { chooseFunding, debit } from "./wallet";

/**
 * Merchant / payment-rail boundary.
 *
 * Each search returns normalized offers; `prepareOrder` reserves an offer and
 * issues a confirmation token; `confirmOrder` debits the private balance
 * (USDC first, else SOL at the live price) and marks it paid.
 * Demo providers return deterministic-but-plausible inventory so the agent
 * flow can be exercised end-to-end without API keys. Real adapters
 * (Crossmint Worldstore, Duffel, Bitrefill, Travala) slot in behind the same
 * `Offer` shape — see docs/ARCHITECTURE.md and docs/PLATFORMS.md.
 */

export interface Offer {
  id: string;
  kind: OrderKind;
  title: string;
  subtitle: string;
  merchant: string;
  rail: string;
  priceUsd: number;
  details: Record<string, unknown>;
}

const AIRLINES = ["Delta", "United", "JetBlue", "Lufthansa", "ANA", "KLM"];
const HOTELS = [
  ["The Hoxton", "Boutique · 4★"],
  ["Ace Hotel", "Design · 4★"],
  ["citizenM", "Smart · 3★"],
  ["Park Hyatt", "Luxury · 5★"],
];

function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = (h ^ str.charCodeAt(i)) * 16777619;
  return Math.abs(h >>> 0);
}

export function searchFlights(q: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string;
  passengers: number;
  cabin: "economy" | "premium_economy" | "business";
}): Offer[] {
  const seed = hash(`${q.origin}${q.destination}${q.departDate}`);
  const cabinMult = q.cabin === "business" ? 3.4 : q.cabin === "premium_economy" ? 1.7 : 1;
  return Array.from({ length: 3 }, (_, i) => {
    const airline = AIRLINES[(seed + i) % AIRLINES.length];
    const depHour = 6 + ((seed >> (i * 3)) % 14);
    const durationMin = 150 + ((seed >> (i * 5)) % 420);
    const stops = i === 0 ? 0 : (seed >> i) % 2;
    const base = 180 + ((seed >> (i * 2)) % 340) + stops * -40 + i * 35;
    const price = Math.round(base * cabinMult * q.passengers * (q.returnDate ? 1.85 : 1));
    return {
      id: newId("fl"),
      kind: "flight",
      title: `${q.origin.toUpperCase()} → ${q.destination.toUpperCase()} · ${airline}`,
      subtitle: `${String(depHour).padStart(2, "0")}:${(seed >> i) % 2 ? "35" : "10"} depart · ${Math.floor(durationMin / 60)}h ${durationMin % 60}m · ${stops ? `${stops} stop` : "nonstop"} · ${q.cabin.replace("_", " ")}`,
      merchant: airline,
      rail: "Cryptorefills (USDC on Solana, via Duffel) / Duffel + stablecoin card",
      priceUsd: price,
      details: { ...q, airline, stops, durationMin, depHour },
    };
  });
}

export function searchHotels(q: {
  city: string;
  checkIn: string;
  checkOut: string;
  guests: number;
}): Offer[] {
  const seed = hash(`${q.city}${q.checkIn}`);
  const nights = Math.max(
    1,
    Math.round((new Date(q.checkOut).getTime() - new Date(q.checkIn).getTime()) / 86_400_000),
  );
  return HOTELS.slice(0, 3).map(([name, tag], i) => {
    const nightly = 140 + ((seed >> (i * 4)) % 260) + i * 60;
    return {
      id: newId("ht"),
      kind: "hotel",
      title: `${name} ${q.city}`,
      subtitle: `${tag} · ${nights} night${nights > 1 ? "s" : ""} · ${q.guests} guest${q.guests > 1 ? "s" : ""} · $${nightly}/night`,
      merchant: name,
      rail: "Travala Travel MCP (USDC on Base, x402) / LiteAPI + stablecoin card",
      priceUsd: nightly * nights,
      details: { ...q, nights, nightly },
    };
  });
}

const GIFTCARDS: Record<string, { brand: string; denominations: number[]; rail: string }> = {
  "uber eats": { brand: "Uber Eats", denominations: [25, 50, 100], rail: "Bitrefill MCP (USDC on Solana)" },
  doordash: { brand: "DoorDash", denominations: [25, 50, 100], rail: "Bitrefill MCP (USDC on Solana)" },
  amazon: { brand: "Amazon", denominations: [25, 50, 100, 200], rail: "Bitrefill / CryptoRefills (USDC)" },
  airbnb: { brand: "Airbnb", denominations: [50, 100, 250, 500], rail: "Bitrefill (USDC on Solana)" },
  steam: { brand: "Steam", denominations: [20, 50, 100], rail: "Bitrefill / CryptoRefills (USDC)" },
  spotify: { brand: "Spotify", denominations: [10, 30, 60], rail: "Bitrefill (USDC on Solana)" },
  starbucks: { brand: "Starbucks", denominations: [10, 25, 50], rail: "Bitrefill (USDC on Solana)" },
};

export function searchGiftCards(q: { brand: string; amountUsd?: number }): Offer[] {
  const key = Object.keys(GIFTCARDS).find((k) => q.brand.toLowerCase().includes(k));
  if (!key) return [];
  const g = GIFTCARDS[key];
  const denoms = q.amountUsd
    ? g.denominations.filter((d) => d >= q.amountUsd!).slice(0, 2)
    : g.denominations.slice(0, 3);
  return denoms.map((d) => ({
    id: newId("gc"),
    kind: "giftcard",
    title: `${g.brand} gift card · $${d}`,
    subtitle: "Digital delivery · code revealed in Privi after payment",
    merchant: g.brand,
    rail: g.rail,
    priceUsd: Math.round(d * 1.015 * 100) / 100,
    details: { brand: g.brand, faceValueUsd: d },
  }));
}

export function searchProducts(q: { query: string; maxPriceUsd?: number }): Offer[] {
  const seed = hash(q.query.toLowerCase());
  const base = 20 + (seed % 180);
  const variants = ["", " (Pro)", " — refurbished"];
  return variants
    .map((v, i) => ({
      id: newId("pd"),
      kind: "product" as OrderKind,
      title: `${titleCase(q.query)}${v}`,
      subtitle: i === 2 ? "Ships in 3–5 days · 90-day warranty" : "Ships in 1–2 days · Prime-eligible",
      merchant: "Amazon via Crossmint",
      rail: "Crossmint Worldstore (USDC on Base; partner access)",
      priceUsd: Math.round(base * (i === 1 ? 1.6 : i === 2 ? 0.7 : 1) * 100) / 100,
      details: { query: q.query, variant: v || "standard" },
    }))
    .filter((o) => !q.maxPriceUsd || o.priceUsd <= q.maxPriceUsd);
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// --- Orders -----------------------------------------------------------------

/**
 * Privi's service fee, added on top of every purchase (2%). It is charged to
 * the private balance with the order and refunded with it if the order fails.
 */
export const PRIVI_FEE_RATE = 0.02;
export const withPriviFee = (usd: number) => usd * (1 + PRIVI_FEE_RATE);

export function prepareOrder(s: SessionState, offer: Offer): Order {
  // Fund with USDC when it covers the price (fee included), otherwise SOL. If
  // neither does, still reserve in USDC; the agent will ask for a deposit.
  const asset = chooseFunding(s, withPriviFee(offer.priceUsd))?.asset ?? "USDC";
  const amount = asset === "USDC" ? offer.priceUsd : offer.priceUsd / s.wallet.prices.SOL;
  return prepareOrderWith(s, offer, { payAsset: asset, payAmount: amount });
}

/** Reserve an offer with an explicit payment (e.g. an exact merchant invoice). */
export function prepareOrderWith(
  s: SessionState,
  offer: Offer,
  pay: { payAsset: Asset; payAmount: number; priceUsd?: number; details?: Record<string, unknown> },
): Order {
  const now = new Date().toISOString();
  // Add Privi's fee on top of the merchant amount, rounded up so the merchant
  // amount is always fully covered.
  const baseUsd = pay.priceUsd ?? offer.priceUsd;
  const feeUsd = Math.round(baseUsd * PRIVI_FEE_RATE * 100) / 100;
  const dp = pay.payAsset === "SOL" ? 1e6 : 1e2;
  const payAmount = Math.ceil(pay.payAmount * (1 + PRIVI_FEE_RATE) * dp - 1e-6) / dp;
  const order: Order = {
    id: newId("ord"),
    kind: offer.kind,
    title: offer.title,
    subtitle: offer.subtitle,
    merchant: offer.merchant,
    rail: offer.rail,
    priceUsd: Math.round((baseUsd + feeUsd) * 100) / 100,
    payAsset: pay.payAsset,
    payAmount,
    status: "awaiting_confirmation",
    details: {
      ...offer.details,
      ...(pay.details ?? {}),
      priviFee: { rate: PRIVI_FEE_RATE, usd: feeUsd, merchantUsd: baseUsd, merchantPayAmount: pay.payAmount },
    },
    confirmationToken: newId("ok"),
    createdAt: now,
    updatedAt: now,
  };
  s.orders.unshift(order);
  return order;
}

export function confirmOrder(s: SessionState, orderId: string, token: string): Order {
  const order = s.orders.find((o) => o.id === orderId);
  if (!order) throw new Error(`Unknown order ${orderId}.`);
  if (order.status !== "awaiting_confirmation") {
    throw new Error(`Order ${orderId} is ${order.status}, not awaiting confirmation.`);
  }
  if (order.confirmationToken !== token) {
    throw new Error("Confirmation token mismatch. Ask the user to approve again.");
  }
  debit(s, order.payAsset, order.payAmount);
  void import("./telemetry").then((t) => t.bump("orders"));
  order.status = "paid";
  order.reference = `${order.merchant.slice(0, 3).toUpperCase()}-${newId("").slice(1, 9).toUpperCase()}`;
  order.updatedAt = new Date().toISOString();
  order.confirmationToken = undefined;
  pushActivity(s, {
    kind: "purchase",
    summary: `${order.title}`,
    amount: `−${order.payAsset === "SOL" ? order.payAmount.toFixed(4) : order.payAmount.toFixed(2)} ${order.payAsset}`,
  });
  // Real merchants (Bitrefill) deliver asynchronously; simulated ones instantly.
  if (!order.details.bitrefill && !order.details.zinc) order.status = "fulfilled";
  return order;
}

export function cancelOrder(s: SessionState, orderId: string): Order {
  const order = s.orders.find((o) => o.id === orderId);
  if (!order) throw new Error(`Unknown order ${orderId}.`);
  if (order.status !== "awaiting_confirmation") {
    throw new Error(`Only orders awaiting confirmation can be cancelled.`);
  }
  order.status = "cancelled";
  order.confirmationToken = undefined;
  order.updatedAt = new Date().toISOString();
  return order;
}
