import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { Order, SessionState } from "@/lib/privi/types";
import { balanceOf, chooseFunding, totalUsd } from "@/lib/privi/wallet";
import { liveMode, newId, saveSession } from "@/lib/privi/store";
import * as bitrefill from "@/lib/privi/bitrefill";
import * as zinc from "@/lib/privi/zinc";
import * as brij from "@/lib/privi/brij";
import { PaymentNotTaken } from "@/lib/privi/x402pay";
import { credit } from "@/lib/privi/wallet";
import { pushActivity } from "@/lib/privi/store";
import { applyPrices } from "@/lib/privi/prices";
import { explorerTx, payFromRing, RingPaymentUncertain, ringsConfigured, signatureOutcome, type RingAsset } from "@/lib/privi/rings";
import {
  cancelOrder,
  confirmOrder,
  prepareOrder,
  prepareOrderWith,
  PRIVI_FEE_RATE,
  withPriviFee,
  searchGiftCards,
  type Offer,
} from "@/lib/privi/merchants";

/**
 * Agent tool surface. Each tool = zod schema (runtime validation; required
 * because eager input streaming disables server-side validation) + executor.
 * JSON Schema for the API is derived from zod and forced to strict shape.
 */

/** What the user typed this turn, and when the turn began: server-side evidence of approval. */
export type Approval = { text: string; startedAt: number };
type Ctx = { session: SessionState; offers: Map<string, Offer>; approval?: Approval };

// An approval message may contain only these words (plus an order id). Anything
// else ("ok, find something cheaper", "great, now search hotels") is not one.
const APPROVE_KEY = new Set([
  "yes", "yep", "yeah", "yea", "yup", "y", "ya", "ok", "okay", "k", "kk", "sure", "approve", "approved",
  "confirm", "confirmed", "book", "buy", "order", "place", "pay", "purchase", "proceed", "go", "perfect",
  "great", "good", "alright", "absolutely", "definitely", "fine", "do",
]);
const APPROVE_FILLER = new Set([
  "it", "this", "that", "one", "the", "my", "for", "please", "pls", "thanks", "thank", "you", "now",
  "all", "right", "and", "looks", "sounds", "ahead", "lets", "let's", "let", "us", "just",
]);

/** True when `text` is nothing but an approval ("yes", "book it", "Approve order ord_…"). */
export function isPlainApproval(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 120 || t.includes("?")) return false;
  const words = t
    .toLowerCase()
    .replace(/\bord_[a-f0-9]{12}\b/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z' ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return words.length > 0 && words.some((w) => APPROVE_KEY.has(w)) && words.every((w) => APPROVE_KEY.has(w) || APPROVE_FILLER.has(w));
}

/**
 * A payment needs a human "yes" the model can't fake: the order must have been
 * shown in an earlier turn, and the user's own message this turn must approve
 * it and nothing else. The Approve button sends "Approve order <id>"; a typed
 * "yes" only covers the newest order awaiting approval. Text inside web pages
 * or tool results can't satisfy this.
 */
function approvalProblem(ctx: Ctx, order: Order): string | null {
  const a = ctx.approval;
  if (!a) return "No approval on record. Show the user the summary and wait for them to approve.";
  if (new Date(order.createdAt).getTime() >= a.startedAt) {
    return "The user hasn't seen this order yet. Show the summary (item, price, paid with) and wait for them to approve it.";
  }
  const t = a.text.trim();
  if (!isPlainApproval(t)) return "The user's latest message isn't an approval. Show the summary and ask them to approve this order.";
  const named = (t.match(/\bord_[a-f0-9]{12}\b/gi) ?? []).map((n) => n.toLowerCase());
  if (named.length) return named.length === 1 && named[0] === order.id ? null : "The user's message doesn't approve this order. Ask them to approve it.";
  // A bare "yes" approves only what the user was just shown: the newest order awaiting approval.
  const newest = ctx.session.orders
    .filter((o) => o.status === "awaiting_confirmation" && new Date(o.createdAt).getTime() < a.startedAt)
    .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())[0];
  if (newest?.id !== order.id) return "Several orders are awaiting approval. Ask the user to approve this one by tapping its Approve button.";
  return null;
}

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  schema: S;
  run: (input: z.infer<S>, ctx: Ctx) => Promise<unknown> | unknown;
}

function def<S extends z.ZodType>(t: ToolDef<S>) {
  return t as ToolDef<z.ZodType>;
}



/**
 * How a USD amount will be paid: USDC when the balance covers it, otherwise
 * SOL at the live conversion quote (the most SOL needed, incl. slippage).
 */
/** Privi's fee charged on an order (0 for orders made before the fee). */
function priviFeeUsd(o: Order): number {
  return (o.details.priviFee as { usd?: number } | undefined)?.usd ?? 0;
}

async function fundingFor(s: SessionState, usd: number): Promise<{ payAsset: "USDC" | "SOL"; payAmount: number }> {
  if (balanceOf(s, "USDC").amount + 1e-9 >= withPriviFee(usd)) return { payAsset: "USDC", payAmount: Math.round(usd * 100) / 100 };
  const q = await zinc.quoteSolForUsdc(usd);
  return { payAsset: "SOL", payAmount: Math.ceil(q.solMax * 1e4) / 1e4 };
}

const travelOff = () => !liveMode() || !brij.brijEnabled();

const PassengerSchema = z.object({
  given_name: z.string().describe("First name exactly as on the ID/passport"),
  family_name: z.string().describe("Last name exactly as on the ID/passport"),
  born_on: z.string().describe("Date of birth YYYY-MM-DD"),
  title: z.enum(["mr", "mrs", "ms", "miss", "dr"]),
  gender: z.enum(["m", "f"]).describe("As on the travel document"),
  email: z.string(),
  phone_number: z.string().describe("E.164, e.g. +14155550123"),
});

export const TOOLS = [
  def({
    name: "get_wallet",
    description:
      "Read the user's private balance (SOL and USDC held in a Helius Privacy Ring), live USD prices, and any orders awaiting approval. Call this before quoting prices so you know what is affordable.",
    schema: z.object({}),
    run: async (_i, { session }) => ({
      balances: session.wallet.balances,
      prices: (await applyPrices(session)).prices,
      pricesNote: "Live USD spot prices; SOL/USD moves, so recheck before paying in SOL.",
      totalUsd: Math.round(totalUsd(session) * 100) / 100,
      recentOrders: session.orders
        .filter((o) => o.status !== "awaiting_confirmation" && o.status !== "cancelled")
        .slice(0, 8)
        .map((o) => ({ id: o.id, title: o.title, merchant: o.merchant, status: o.status, priceUsd: o.priceUsd, at: o.createdAt })),
      ordersNote: "Each order has a page under Orders in the sidebar with live tracking; use check_order for the latest status.",
      openOrders: session.orders
        .filter((o) => o.status === "awaiting_confirmation")
        .map((o) => ({ id: o.id, title: o.title, priceUsd: o.priceUsd })),
    }),
  }),

  def({
    name: "search_gift_cards",
    description:
      "Find digital gift cards (Uber Eats, DoorDash, Amazon, Airbnb, Steam, Spotify, Starbucks). This is how food delivery and most big retailers are paid for with crypto — explain that to the user when relevant.",
    schema: z.object({
      brand: z.string().describe("Brand name, e.g. 'Uber Eats'"),
      amount_usd: z.number().nullable().describe("Desired face value in USD, or null"),
      country: z.string().nullable().describe("ISO country code of the card's region, e.g. US, GB, CA; null for US"),
    }),
    run: async (i, ctx) => {
      if (!liveMode() || !bitrefill.bitrefillEnabled()) {
        return remember(ctx, searchGiftCards({ brand: i.brand, amountUsd: i.amount_usd ?? undefined }));
      }
      try {
        const cards = await bitrefill.searchGiftCards({ brand: i.brand, amountUsd: i.amount_usd ?? undefined, country: i.country ?? undefined });
        if (cards.length === 0) return { offers: [], note: `No in-stock ${i.brand} gift cards found for ${i.country ?? "US"}.` };
        return remember(
          ctx,
          cards.map((c) => ({
            id: newId("gc"),
            kind: "giftcard" as const,
            title: `${c.name} · ${c.faceValue} ${c.faceCurrency}`,
            subtitle: "Digital delivery · code appears here after payment",
            merchant: c.name,
            rail: "Bitrefill",
            priceUsd: c.priceUsd,
            details: { live: true, bitrefill: { productId: c.productId, packageId: c.packageId } },
          })),
        );
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  }),

  def({
    name: "prepare_purchase",
    description:
      "Reserve an offer and create an order awaiting the user's confirmation. Returns the order with a confirmation_token and what it will be paid with (USDC if it covers the price, otherwise SOL). You MUST then show the user a short summary (item, price, paid with) and wait for them to approve. Never call confirm_purchase in the same turn.",
    schema: z.object({
      offer_id: z.string().describe("An offer id from a search_* result"),
    }),
    run: async ({ offer_id }, ctx) => {
      const offer = ctx.offers.get(offer_id) ?? findOfferInHistory(ctx.session, offer_id);
      if (!offer) return { error: `Unknown offer ${offer_id}. Search again to get fresh offers.` };
      if (liveMode() && !offer.details.live) return { error: "That item isn't purchasable on live Privi yet." };

      const br = offer.details.bitrefill as { productId: string; packageId: string } | undefined;
      if (br) {
        // A real invoice up front: the user approves the exact amount that will be charged.
        const funding = chooseFunding(ctx.session, withPriviFee(offer.priceUsd)) ?? { asset: "USDC" as const, amount: offer.priceUsd };
        try {
          const inv = await bitrefill.createInvoice({ productId: br.productId, packageId: br.packageId, asset: funding.asset });
          const amount = Number(inv.payment.amount);
          const order = prepareOrderWith(ctx.session, offer, {
            payAsset: funding.asset,
            payAmount: amount,
            priceUsd: inv.payment.price_usd ?? offer.priceUsd,
            details: {
              payTo: { address: inv.payment.address, asset: funding.asset, amount },
              bitrefill: { ...br, invoiceId: inv.id, orderId: inv.orders[0]?.id, expiresAt: inv.payment.expires_at },
            },
          });
          const covered = balanceOf(ctx.session, funding.asset).amount + 1e-9 >= order.payAmount;
          return {
            order: { ...order, confirmationToken: order.confirmationToken },
            paysWith: `${order.payAmount} ${funding.asset}`,
            covered,
            expiresAt: inv.payment.expires_at,
            ...(covered ? {} : { note: "Balance does not cover this. Ask the user to deposit SOL or USDC from the Funds card first." }),
          };
        } catch (e) {
          return { error: (e as Error).message };
        }
      }

      const order = prepareOrder(ctx.session, offer);
      const covered = chooseFunding(ctx.session, order.priceUsd) !== undefined;
      return {
        order,
        paysWith: `${order.payAmount} ${order.payAsset}`,
        covered,
        ...(covered ? {} : { note: "Balance does not cover this. Ask the user to deposit SOL or USDC from the Funds card first." }),
      };
    },
  }),

  def({
    name: "search_products",
    description:
      "Search live store catalogs (Amazon, Walmart, Target, Best Buy, Home Depot and more) for physical products. Returns current, in-stock listings with real prices and working product URLs. Always use this for physical products instead of web search; only link products from these results.",
    schema: z.object({
      query: z.string().describe("What to look for, e.g. 'nurse badge reel retractable'"),
      max_price_usd: z.number().nullable().describe("Budget per item in USD, or null"),
      retailer: z.string().nullable().describe("Limit to one store (amazon, walmart, target, bestbuy…), or null for all"),
    }),
    run: async (i) => {
      if (!liveMode() || !zinc.zincEnabled()) return { error: "Store search isn't available right now." };
      try {
        const products = await zinc.searchProducts({ query: i.query, maxPriceUsd: i.max_price_usd, retailer: i.retailer });
        if (!products.length) return { products: [], note: "No in-stock matches. Try different words or a higher budget." };
        return { products, sources: products.map((p) => ({ title: p.title, url: p.url })) };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  }),

  def({
    name: "search_flights",
    description:
      "Search live airline fares that Privi can book and ticket directly (real airlines, paid from the private balance). Prices are all-in USD including Privi's booking fee. Use IATA codes. Returns up to 6 itineraries with offer ids for prepare_flight_booking.",
    schema: z.object({
      origin: z.string().describe("IATA airport or city code, e.g. SFO"),
      destination: z.string().describe("IATA airport or city code, e.g. JFK"),
      depart_date: z.string().describe("YYYY-MM-DD"),
      return_date: z.string().nullable().describe("YYYY-MM-DD for a round trip, or null"),
      adults: z.number().int().min(1).max(9),
      cabin_class: z.enum(["economy", "premium_economy", "business", "first"]).nullable(),
      max_stops: z.number().int().min(0).max(2).nullable().describe("0 = nonstop only"),
      sort: z.enum(["price", "duration", "departure"]).nullable(),
    }),
    run: async (i) => {
      if (travelOff()) return { error: "Flight booking isn't available right now. Offer an airline gift card (Delta, Southwest) instead." };
      try {
        const flights = await brij.searchFlights({ origin: i.origin, destination: i.destination, departDate: i.depart_date, returnDate: i.return_date, adults: i.adults, cabin: i.cabin_class, maxStops: i.max_stops, sort: i.sort });
        if (!flights.length) return { flights: [], note: "No bookable fares for that search. Try nearby dates or airports." };
        const { kv } = await import("@/lib/privi/kv");
        await Promise.all(flights.map((f) => kv.set(`flight:${f.offerId}`, f, 3600)));
        return { flights, adults: i.adults };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  }),

  def({
    name: "prepare_flight_booking",
    description:
      "Lock a fare from search_flights and create an order awaiting the user's approval. Needs every traveller's details exactly as on their ID: given and family name, date of birth, title, gender, email, phone (E.164). Ask for anything missing first; collect one traveller per adult searched, lead traveller first. Then show a summary (flight, times, fare, bags, refundability, travellers' names, total, what it's paid with) and wait for approval before confirm_purchase. The locked fare holds about 15 minutes.",
    schema: z.object({ offer_id: z.string(), passengers: z.array(PassengerSchema).min(1).max(9) }),
    run: async ({ offer_id, passengers }, ctx) => {
      if (travelOff()) return { error: "Flight booking isn't available right now." };
      const found = await import("@/lib/privi/kv").then(({ kv }) => kv.get<brij.FlightOffer>(`flight:${offer_id}`));
      try {
        const intent = await brij.createFlightIntent(offer_id);
        if (intent.passengerCount !== passengers.length) {
          return { error: `This fare was priced for ${intent.passengerCount} traveller(s); got ${passengers.length}. Search again with the right number of adults.` };
        }
        await applyPrices(ctx.session);
        const pay = await fundingFor(ctx.session, intent.escrowUsd);
        const title = found ? `${found.from} → ${found.to} · ${found.airline}` : "Flight";
        const when = found ? `${found.departs.replace("T", " ").slice(0, 16)}${found.returnDeparts ? ` · return ${found.returnDeparts.replace("T", " ").slice(0, 16)}` : ""}` : "";
        const order = prepareOrderWith(
          ctx.session,
          { id: newId("off"), kind: "flight", title, subtitle: `${when}${found ? ` · ${found.fare}` : ""}`, merchant: found?.airline ?? "Airline", rail: "Airline ticket · USDC escrow", priceUsd: intent.escrowUsd, details: { live: true } },
          {
            payAsset: pay.payAsset,
            payAmount: pay.payAmount,
            priceUsd: intent.escrowUsd,
            details: {
              brij: { kind: "air", intent },
              flight: found ?? null,
              travellers: passengers.map((p) => `${p.given_name} ${p.family_name}`),
              passengers,
            },
          },
        );
        const covered = balanceOf(ctx.session, order.payAsset).amount + 1e-9 >= order.payAmount;
        return {
          order: { ...order, details: { ...order.details, passengers: undefined } },
          paysWith: `${order.payAmount} ${order.payAsset}`,
          breakdown: { ticketUsd: intent.ticketUsd, bookingFeeUsd: intent.feeUsd, priviFeeUsd: priviFeeUsd(order), totalUsd: order.priceUsd },
          fare: found ? { fare: found.fare, checkedBags: found.checkedBags, refundable: found.refundable, changeable: found.changeable } : undefined,
          holdsUntil: intent.expiresAt,
          covered,
          note: "Read the travellers' names back to the user: they must match their IDs exactly. Funds sit in escrow and are refunded in full if the airline doesn't ticket.",
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  }),

  def({
    name: "search_hotels",
    description:
      "Search hotels Privi can book directly (paid from the private balance). Returns up to 8 hotels with all-in 'from' prices for the whole stay. Then use hotel_rooms to see rooms and rates.",
    schema: z.object({
      location: z.string().describe("City name, e.g. Lisbon"),
      check_in: z.string().describe("YYYY-MM-DD"),
      check_out: z.string().describe("YYYY-MM-DD"),
      adults: z.number().int().min(1).max(8),
      rooms: z.number().int().min(1).max(4),
      free_cancellation_only: z.boolean().nullable(),
      stars: z.array(z.number().int().min(1).max(5)).nullable(),
    }),
    run: async (i) => {
      if (travelOff()) return { error: "Hotel booking isn't available right now. Offer an Airbnb or Expedia gift card instead." };
      try {
        const r = await brij.searchHotels({ location: i.location, checkIn: i.check_in, checkOut: i.check_out, adults: i.adults, rooms: i.rooms, freeCancellationOnly: i.free_cancellation_only, stars: i.stars });
        return { ...r, checkIn: i.check_in, checkOut: i.check_out };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  }),

  def({
    name: "hotel_rooms",
    description: "Rooms and rates for one hotel from search_hotels: board, refundability, all-in total, and anything due at the hotel on top (e.g. city tax).",
    schema: z.object({ hotel_id: z.string() }),
    run: async ({ hotel_id }) => {
      if (travelOff()) return { error: "Hotel booking isn't available right now." };
      try {
        return await brij.hotelRates(hotel_id);
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  }),

  def({
    name: "prepare_hotel_booking",
    description:
      "Lock a hotel rate from hotel_rooms and create an order awaiting approval. Needs the lead guest's name (and one name per room), email and phone (E.164). Then summarise (hotel, room, dates, refundability, total, anything due at the hotel, paid with) and wait for approval before confirm_purchase.",
    schema: z.object({
      rate_id: z.string(),
      guests: z.array(z.object({ given_name: z.string(), family_name: z.string() })).min(1).max(4),
      email: z.string(),
      phone_number: z.string().describe("E.164"),
    }),
    run: async (i, ctx) => {
      if (travelOff()) return { error: "Hotel booking isn't available right now." };
      try {
        const h = await brij.prepareHotel(i.rate_id);
        await applyPrices(ctx.session);
        const pay = await fundingFor(ctx.session, h.intent.escrowUsd);
        const order = prepareOrderWith(
          ctx.session,
          { id: newId("off"), kind: "hotel", title: h.hotel, subtitle: `${h.room} · ${h.checkIn} → ${h.checkOut} (${h.nights} night${h.nights === 1 ? "" : "s"})`, merchant: h.hotel, rail: "Hotel booking · USDC escrow", priceUsd: h.intent.escrowUsd, details: { live: true } },
          {
            payAsset: pay.payAsset,
            payAmount: pay.payAmount,
            priceUsd: h.intent.escrowUsd,
            details: {
              brij: { kind: "hotel", intent: h.intent },
              stay: { checkIn: h.checkIn, checkOut: h.checkOut, nights: h.nights, room: h.room, refundability: h.refundability, dueAtHotel: h.dueAtHotel },
              travellers: i.guests.map((g) => `${g.given_name} ${g.family_name}`),
              guest: { guests: i.guests, email: i.email, phone_number: i.phone_number },
            },
          },
        );
        const covered = balanceOf(ctx.session, order.payAsset).amount + 1e-9 >= order.payAmount;
        return {
          order: { ...order, details: { ...order.details, guest: undefined } },
          paysWith: `${order.payAmount} ${order.payAsset}`,
          refundability: h.refundability,
          dueAtHotel: h.dueAtHotel ?? null,
          holdsUntil: h.intent.expiresAt,
          covered,
        };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  }),

  def({
    name: "prepare_product_order",
    description:
      "Prepare a real order for a physical product from a store page you found with web search (Amazon, Walmart, Target, Best Buy, Home Depot and most other US retailers). Ships to the user's address. Privi pays the store directly from the private balance; no gift card needed. Needs the exact product page URL from your search results, the listed price, and the full shipping address (ask the user for anything missing: name, street, city, state, ZIP, phone). The order is charged up to a cap (price + tax/shipping allowance + $1 service fee); anything unused is refunded to the balance. Show the user the item, the cap and what it's paid with, then wait for approval and call confirm_purchase.",
    schema: z.object({
      product_url: z.string().describe("Exact product page URL from search results"),
      title: z.string().describe("Short product name"),
      price_usd: z.number().positive().describe("Listed unit price in USD"),
      quantity: z.number().int().min(1).max(10),
      shipping: z.object({
        first_name: z.string(),
        last_name: z.string(),
        address_line1: z.string(),
        address_line2: z.string().nullable(),
        city: z.string(),
        state: z.string().nullable(),
        postal_code: z.string(),
        country: z.string().describe("Two-letter country code, e.g. US"),
        phone_number: z.string(),
      }).nullable().describe("Shipping address, or null to reuse the one saved from the user's last order"),
    }),
    run: async (i, ctx) => {
      if (!liveMode() || !zinc.zincEnabled()) return { error: "Direct store orders aren't available right now. Offer a gift card for the store instead." };
      const shipping = i.shipping ?? ctx.session.shipping;
      if (!shipping) return { error: "Need the shipping address first: name, street, city, state, ZIP and phone." };
      let check: zinc.RetailerCheck;
      try {
        check = await zinc.checkRetailer(i.product_url);
      } catch (e) {
        return { error: (e as Error).message };
      }
      if (!check.orderable) return { error: `Direct orders from ${check.retailer} aren't supported. Offer a gift card for the store instead.` };
      if (check.shipsTo.length && !check.shipsTo.includes(shipping.country.toUpperCase())) {
        return { error: `${check.retailer} ships to ${check.shipsTo.join(", ")} only.` };
      }
      const capUsd = zinc.maxPriceUsd(i.price_usd, i.quantity);
      if (capUsd > 499) return { error: "Direct store orders are limited to $499 each. Suggest splitting the order." };
      const totalUsd = capUsd + zinc.ZINC_FEE_USD;
      await applyPrices(ctx.session);
      let payAsset: "USDC" | "SOL" = "USDC";
      let payAmount = totalUsd;
      if (balanceOf(ctx.session, "USDC").amount + 1e-9 < withPriviFee(totalUsd)) {
        try {
          const q = await zinc.quoteSolForUsdc(totalUsd);
          payAsset = "SOL";
          payAmount = Math.ceil(q.solMax * 1e4) / 1e4;
        } catch (e) {
          return { error: (e as Error).message };
        }
      }
      ctx.session.shipping = { ...shipping, address_line2: shipping.address_line2 ?? null, state: shipping.state ?? null };
      const offer: Offer = {
        id: newId("off"),
        kind: "product",
        title: i.quantity > 1 ? `${i.title} × ${i.quantity}` : i.title,
        subtitle: `${check.retailer} · ships to ${shipping.city}${shipping.state ? `, ${shipping.state}` : ""}`,
        merchant: check.retailer,
        rail: "Direct order · USDC on Solana",
        priceUsd: totalUsd,
        details: { live: true },
      };
      const order = prepareOrderWith(ctx.session, offer, {
        payAsset,
        payAmount,
        priceUsd: totalUsd,
        details: {
          zinc: { url: i.product_url, quantity: i.quantity, maxPriceCents: capUsd * 100, listedUsd: i.price_usd },
          cap: { itemUsd: i.price_usd * i.quantity, capUsd, feeUsd: zinc.ZINC_FEE_USD },
        },
      });
      const covered = balanceOf(ctx.session, order.payAsset).amount + 1e-9 >= order.payAmount;
      return {
        order,
        paysWith: `up to ${order.payAmount} ${order.payAsset}`,
        note: `Charged up to $${order.priceUsd.toFixed(2)} (item, tax and shipping capped at $${capUsd}, plus a $1 order fee and Privi's 2% fee). Whatever the store total doesn't use is refunded to the balance in USDC, with its share of the 2% fee.`,
        covered,
        ...(covered ? {} : { balanceNote: "Balance does not cover this. Ask the user to deposit SOL or USDC from the Funds card first." }),
      };
    },
  }),

  def({
    name: "confirm_purchase",
    description:
      "Pay for an order the user has explicitly approved in their latest message (e.g. 'yes', 'approve', 'book it'). Requires the order_id and the confirmation_token from prepare_purchase. Pays from the user's private balance.",
    schema: z.object({
      order_id: z.string(),
      confirmation_token: z.string(),
    }),
    run: async ({ order_id, confirmation_token }, ctx) => {
      const { session } = ctx;
      const target = session.orders.find((o) => o.id === order_id);
      if (!target) return { error: "Order not found." };
      const notApproved = approvalProblem(ctx, target);
      if (notApproved) return { error: notApproved };
      try {
        // Orders from real rails carry a Solana payment destination. Every
        // check runs before any money moves: approval token, invoice expiry,
        // and the user's own balance. Only then does the ring pay.
        const pending = session.orders.find((o) => o.id === order_id);
        const bj = pending?.details?.brij as { kind: "air" | "hotel"; intent: brij.Intent } | undefined;
        if (pending && bj) {
          if (pending.status !== "awaiting_confirmation" || pending.confirmationToken !== confirmation_token) {
            return { error: "Order is not awaiting this confirmation. Ask the user to approve again." };
          }
          if (Date.now() > new Date(bj.intent.expiresAt).getTime() - 60_000) {
            return { error: "The held price expired. Prepare the booking again for a fresh price." };
          }
          if (balanceOf(session, pending.payAsset).amount + 1e-9 < pending.payAmount) {
            return { error: `Insufficient ${pending.payAsset}. Ask the user to deposit from the Funds card, then approve again.` };
          }
          const pay = { asset: pending.payAsset, solBudget: pending.payAsset === "SOL" ? pending.payAmount : 0 };
          try {
            if (bj.kind === "air") {
              const r = await brij.bookFlight(bj.intent, pending.details.passengers as brij.Passenger[], pay);
              pending.details = { ...pending.details, brijStatus: r.status, bookingReference: r.reference, fundingSignatures: r.fundingSignatures };
            } else {
              const r = await brij.bookHotel(bj.intent, pending.details.guest as { guests: { given_name: string; family_name: string }[]; email: string; phone_number: string }, pay);
              pending.details = { ...pending.details, brijStatus: r.status, fundingSignatures: r.fundingSignatures };
            }
          } catch (e) {
            if (e instanceof PaymentNotTaken) {
              pending.status = "failed";
              pending.details = { ...pending.details, error: e.message };
              return { error: `The booking wasn't accepted: ${e.message} Nothing was charged.` };
            }
            throw e;
          }
          const order = confirmOrder(session, order_id, confirmation_token);
          await settleBrij(session, order, 25_000);
          return { ok: true, order: { ...order, details: { ...order.details, passengers: undefined, guest: undefined } } };
        }
        const z = pending?.details?.zinc as { url: string; quantity: number; maxPriceCents: number } | undefined;
        if (pending && z) {
          if (pending.status !== "awaiting_confirmation" || pending.confirmationToken !== confirmation_token) {
            return { error: "Order is not awaiting this confirmation. Ask the user to approve again." };
          }
          if (!session.shipping) return { error: "Shipping address missing. Prepare the order again." };
          if (balanceOf(session, pending.payAsset).amount + 1e-9 < pending.payAmount) {
            return { error: `Insufficient ${pending.payAsset}. Ask the user to deposit from the Funds card, then approve again.` };
          }
          try {
            const placed = await zinc.placeOrder(
              { idempotencyKey: pending.id, url: z.url, quantity: z.quantity, maxPriceCents: z.maxPriceCents, shipping: session.shipping },
              { asset: pending.payAsset, solBudget: pending.payAsset === "SOL" ? pending.payAmount : 0 },
            );
            pending.details = { ...pending.details, zincOrderId: placed.zincOrderId, zincStatus: placed.status, fundingSignatures: placed.fundingSignatures };
          } catch (e) {
            if (e instanceof zinc.ZincRejected) {
              pending.status = "failed";
              pending.details = { ...pending.details, error: e.message };
              return { error: `The store didn't accept this order: ${e.message} Nothing was charged.` };
            }
            throw e;
          }
          const order = confirmOrder(session, order_id, confirmation_token);
          await settleZinc(session, order, 20_000);
          return { ok: true, order };
        }
        const payTo = pending?.details?.payTo as { address: string; asset: RingAsset; amount: number } | undefined;
        if (pending && payTo) {
          if (pending.status !== "awaiting_confirmation" || pending.confirmationToken !== confirmation_token) {
            return { error: "Order is not awaiting this confirmation. Ask the user to approve again." };
          }
          if (!ringsConfigured()) return { error: "Private payments are not configured on this server." };
          const br = pending.details.bitrefill as { expiresAt?: string } | undefined;
          if (br?.expiresAt && Date.now() > new Date(br.expiresAt).getTime() - 2 * 60_000) {
            return { error: "This order's price quote has expired. Search again and prepare a fresh order." };
          }
          if (balanceOf(session, pending.payAsset).amount + 1e-9 < pending.payAmount) {
            return { error: `Insufficient ${pending.payAsset}. Ask the user to deposit from the Funds card, then approve again.` };
          }
          // Write-ahead: debit and save before any money moves, and save the
          // signature before it's sent, so a retry, an expired lock or a killed
          // function can never pay twice from one balance.
          const topActivity = session.activity[0]?.id;
          const order = confirmOrder(session, order_id, confirmation_token);
          order.details = { ...order.details, paymentStatus: "pending", paymentAt: new Date().toISOString() };
          // Undo the debit while nothing has been signed: the order goes back to awaiting approval.
          const undo = () => {
            credit(session, order.payAsset, order.payAmount);
            if (session.activity[0] && session.activity[0].id !== topActivity) session.activity.shift();
            order.status = "awaiting_confirmation";
            order.confirmationToken = confirmation_token;
            const { paymentStatus: _s, paymentAt: _a, ...rest } = order.details;
            void _s;
            void _a;
            order.details = rest;
          };
          try {
            await saveSession(session);
          } catch (e) {
            undo();
            return { error: `Couldn't start the payment: ${(e as Error).message} Nothing was charged.` };
          }
          try {
            const { signature } = await payFromRing({ to: payTo.address, asset: payTo.asset, amount: payTo.amount }, async (sig) => {
              order.details = { ...order.details, paymentSignature: sig, paymentUrl: explorerTx(sig) };
              await saveSession(session);
            });
            order.details = { ...order.details, paymentSignature: signature, paymentUrl: explorerTx(signature), paymentStatus: "sent" };
          } catch (e) {
            if (!(e instanceof RingPaymentUncertain) && !order.details.paymentSignature) {
              // Failed before a transaction existed: undo the debit, keep the order approvable.
              undo();
              return { error: `The payment didn't go through: ${(e as Error).message} Nothing was charged.` };
            }
            // Submitted but unconfirmed: keep the debit; check_order settles it from the signature.
            const sig = e instanceof RingPaymentUncertain ? e.signature : (order.details.paymentSignature as string);
            order.details = { ...order.details, paymentSignature: sig, paymentUrl: explorerTx(sig), paymentStatus: "unconfirmed" };
            return { ok: true, order, note: "Payment submitted; Solana hasn't confirmed it yet. Tell the user it's confirming and to check the order shortly." };
          }
          if (order.details.bitrefill) await awaitDelivery(session, order, 40_000);
          return { ok: true, order, balances: session.wallet.balances };
        }
        const order = confirmOrder(session, order_id, confirmation_token);
        if (order.details.bitrefill) await awaitDelivery(session, order, 40_000);
        return { ok: true, order, balances: session.wallet.balances };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  }),

  def({
    name: "check_order",
    description:
      "Check a paid order: a gift card that is still being delivered (fetches the code once ready), or a store order (placement status, tracking, refund of unused budget). Use when the user asks about an order.",
    schema: z.object({ order_id: z.string() }),
    run: async ({ order_id }, { session }) => {
      const order = session.orders.find((o) => o.id === order_id);
      if (!order) return { error: `Unknown order ${order_id}.` };
      if (order.details.brij && order.status !== "awaiting_confirmation") {
        try {
          await settleBrij(session, order, 10_000);
          return { order: { ...order, details: { ...order.details, passengers: undefined, guest: undefined } } };
        } catch (e) {
          return { error: (e as Error).message };
        }
      }
      if (order.details.zincOrderId) {
        try {
          await settleZinc(session, order, 10_000);
          return { order };
        } catch (e) {
          return { error: (e as Error).message, order };
        }
      }
      if (!order.details.bitrefill) return { order };
      try {
        await awaitDelivery(session, order, 15_000);
        return { order };
      } catch (e) {
        return { error: (e as Error).message, order };
      }
    },
  }),

  def({
    name: "cancel_order",
    description: "Cancel an order that is awaiting confirmation (user declined or changed their mind).",
    schema: z.object({ order_id: z.string() }),
    run: ({ order_id }, { session }) => {
      try {
        return { ok: true, order: cancelOrder(session, order_id) };
      } catch (e) {
        return { error: (e as Error).message };
      }
    },
  }),
];

/**
 * Follow a flight or hotel booking until it's ticketed/confirmed or refunded.
 * A refund (the escrow returns to the spend wallet) is credited back to the
 * user's USDC balance exactly once.
 */
async function settleBrij(session: SessionState, order: Order, budgetMs: number): Promise<void> {
  const bj = order.details.brij as { kind: "air" | "hotel"; intent: brij.Intent };
  const deadline = Date.now() + budgetMs;
  for (;;) {
    let status: string;
    let reference: string | undefined;
    if (bj.kind === "air") {
      const s = await brij.flightStatus(bj.intent.intentId);
      status = s.status;
      reference = s.reference;
    } else {
      const s = await brij.hotelStatus(bj.intent);
      status = s.status;
      reference = s.reference;
    }
    order.details = { ...order.details, brijStatus: status, bookingReference: reference ?? order.details.bookingReference };
    order.updatedAt = new Date().toISOString();
    const done = bj.kind === "air" ? status === "booked" && Boolean(reference) : status === "confirmed";
    const refunded = ["refunded", "failed", "cancelled"].includes(status);
    if (done) order.status = "fulfilled";
    if (refunded && !order.details.refunded) {
      credit(session, "USDC", Math.round((bj.intent.escrowUsd + priviFeeUsd(order)) * 100) / 100);
      pushActivity(session, { kind: "deposit", summary: `Refund · ${order.title}`, amount: `+${bj.intent.escrowUsd.toFixed(2)} USDC` });
      order.details = { ...order.details, refunded: true, refundUsd: bj.intent.escrowUsd + priviFeeUsd(order) };
      order.status = "failed";
    }
    if (order.status !== "paid" || Date.now() > deadline) return;
    await new Promise((r) => setTimeout(r, 4_000));
  }
}

/**
 * Follow a Zinc order. Once the retailer total is known, refund the unused
 * part of the cap; if the order fails, refund everything. Refunds land in the
 * user's USDC balance (Zinc returns USDC) and are applied exactly once.
 */
async function settleZinc(session: SessionState, order: Order, budgetMs: number): Promise<void> {
  const id = order.details.zincOrderId as string | undefined;
  if (!id) return;
  const z = order.details.zinc as { maxPriceCents: number };
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const st = await zinc.getOrder(id);
    order.details = { ...order.details, zincStatus: st.status, tracking: st.tracking, merchantOrderIds: st.merchantOrderIds, estimatedDelivery: st.estimatedDelivery };
    order.updatedAt = new Date().toISOString();
    const failed = ["order_failed", "cancelled", "cancelled_by_retailer"].includes(st.status);
    if (!order.details.refunded && (failed || (st.status === "order_placed" && typeof st.totalCents === "number"))) {
      const unused = failed ? z.maxPriceCents / 100 + zinc.ZINC_FEE_USD : Math.max(0, (z.maxPriceCents - (st.totalCents ?? z.maxPriceCents)) / 100);
      // Privi's fee follows the money: refunded in full on failure, pro rata on unused budget.
      const refundUsd = failed ? unused + priviFeeUsd(order) : unused * (1 + PRIVI_FEE_RATE);
      if (refundUsd > 0) {
        credit(session, "USDC", Math.round(refundUsd * 100) / 100);
        pushActivity(session, { kind: "deposit", summary: failed ? `Refund · ${order.title}` : `Unused budget · ${order.title}`, amount: `+${refundUsd.toFixed(2)} USDC` });
      }
      order.details = { ...order.details, refunded: true, refundUsd, totalUsd: st.totalCents != null ? st.totalCents / 100 : undefined, error: st.error };
      order.status = failed ? "failed" : "fulfilled";
    }
    if (order.status !== "paid" || Date.now() > deadline) return;
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

/** Give a paid gift-card order's full charge (incl. Privi's fee) back, exactly once. */
function refundBitrefill(session: SessionState, order: Order, why: string) {
  order.status = "failed";
  if (order.details.refunded) return;
  credit(session, order.payAsset, order.payAmount);
  pushActivity(session, { kind: "deposit", summary: `Refund · ${order.title}`, amount: `+${order.payAmount} ${order.payAsset}` });
  order.details = { ...order.details, refunded: true, refundAmount: order.payAmount, error: why };
  order.updatedAt = new Date().toISOString();
}

const UNSEEN_GIVE_UP_MS = 5 * 60_000; // blockhash long expired: an unseen payment can't land

/**
 * Poll Bitrefill until the gift card is delivered (or the budget runs out).
 * Settles an unconfirmed ring payment first, and refunds the user when the
 * payment never landed or Bitrefill fails / refunds the order.
 */
async function awaitDelivery(session: SessionState, order: Order, budgetMs: number): Promise<void> {
  const br = order.details.bitrefill as { invoiceId?: string; orderId?: string } | undefined;
  if (order.status === "fulfilled" || order.status === "failed") return;
  if (order.details.paymentStatus === "unconfirmed" || order.details.paymentStatus === "pending") {
    const sig = order.details.paymentSignature as string | undefined;
    const age = Date.now() - new Date((order.details.paymentAt as string | undefined) ?? order.updatedAt).getTime();
    const outcome = sig ? await signatureOutcome(sig) : "pending";
    if (outcome === "landed") order.details = { ...order.details, paymentStatus: "sent" };
    else if (outcome === "failed" || age > UNSEEN_GIVE_UP_MS) {
      refundBitrefill(session, order, "The payment didn't go through on Solana.");
      return;
    } else return; // still confirming
  }
  if (!br?.orderId) return;
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const { status, redemption } = await bitrefill.getRedemption(br.orderId);
    if (redemption && (redemption.code || redemption.link || redemption.instructions)) {
      order.details = { ...order.details, redemption, bitrefillStatus: status };
      order.status = "fulfilled";
      order.updatedAt = new Date().toISOString();
      return;
    }
    if (status === "failed" || status === "refunded") {
      order.details = { ...order.details, bitrefillStatus: status };
      refundBitrefill(session, order, "The merchant couldn't fulfil this order.");
      return;
    }
    await new Promise((r) => setTimeout(r, 6_000)); // Bitrefill allows 60 order reads / 10 min
  }
}

function remember(ctx: Ctx, offers: Offer[]) {
  for (const o of offers) ctx.offers.set(o.id, o);
  // Persist on the session (saved to the store) so a later request — e.g. the
  // user clicking "Select" on an offer card — can still reserve it.
  ctx.session.offers = [...offers, ...ctx.session.offers.filter((x) => !offers.some((o) => o.id === x.id))];
  return { offers };
}

function findOfferInHistory(s: SessionState, id: string): Offer | undefined {
  return s.offers.find((o) => o.id === id);
}

// Keywords the strict tool-schema grammar rejects; zod still enforces them at runtime.
const UNSUPPORTED = new Set([
  "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf",
  "minLength", "maxLength", "pattern", "minItems", "maxItems", "uniqueItems", "$schema",
]);

function scrub(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(scrub);
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (UNSUPPORTED.has(k)) continue;
      out[k] = scrub(v);
    }
    if (out.type === "object") {
      out.additionalProperties = false;
      out.required ??= Object.keys((out.properties as object) ?? {});
    }
    return out;
  }
  return node;
}

/** Convert zod → strict JSON Schema accepted by the Messages API. */
function toInputSchema(schema: z.ZodType): Anthropic.Beta.BetaTool["input_schema"] {
  const json = z.toJSONSchema(schema, { io: "input", target: "draft-7" });
  return scrub(json) as Anthropic.Beta.BetaTool["input_schema"];
}

/**
 * Strict (grammar-constrained) decoding only for the short money-moving tools.
 * The API compiles all strict schemas into one grammar with a size limit, and
 * the travel/shipping tools (nested travellers, addresses) blow past it. Every
 * tool's input is validated against its zod schema in runTool regardless.
 */
const STRICT = new Set(["get_wallet", "prepare_purchase", "confirm_purchase", "check_order", "cancel_order"]);

export const TOOL_PARAMS: Anthropic.Beta.BetaTool[] = TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: toInputSchema(t.schema),
  ...(STRICT.has(t.name) ? { strict: true } : {}),
  eager_input_streaming: true,
}));

export function newToolContext(session: SessionState, approval?: Approval): Ctx {
  return { session, offers: new Map(session.offers.map((o) => [o.id, o])), approval };
}

export async function runTool(
  name: string,
  rawInput: unknown,
  ctx: Ctx,
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return { ok: false, error: `Unknown tool ${name}` };
  const parsed = tool.schema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: JSON.stringify({ INVALID_JSON: JSON.stringify(rawInput) }) };
  }
  try {
    return { ok: true, result: await tool.run(parsed.data, ctx) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** True once an order needs no more status checks. */
export function orderSettled(o: Order): boolean {
  if (o.status === "failed" || o.status === "cancelled" || o.status === "awaiting_confirmation") return true;
  if (o.kind === "product") {
    const t = (o.details.tracking as { status?: string }[] | undefined) ?? [];
    return o.status === "fulfilled" && t.length > 0 && t.every((x) => x.status === "delivered");
  }
  return o.status === "fulfilled";
}

/** One status check against the merchant, for the order page. */
export async function refreshOrder(session: SessionState, order: Order): Promise<void> {
  if (orderSettled(order)) return;
  if (order.details.zincOrderId) return settleZinc(session, order, 0);
  if (order.details.brij && order.status === "paid") return settleBrij(session, order, 0);
  if (order.details.bitrefill && order.status === "paid") return awaitDelivery(session, order, 1);
}
