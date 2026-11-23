import "server-only";
import { withLock } from "./kv";
import { spendSigner, type RingAsset } from "./rings";
import { x402Post } from "./x402pay";
import { fundSpend } from "./zinc";

/**
 * BRIJ Travel: real airline tickets and hotel stays (Duffel inventory), paid
 * per call over x402 in USDC on Solana. A booking's fare goes into a
 * per-order escrow that is captured only when the airline tickets (or the
 * hotel confirms) and refunded in full otherwise. No account or contract.
 *
 * Verified against the live API (2026-11-21): /air/search and /hotels/search
 * cost 0.10 USDC; an air intent's expected_escrow_amount equals the offer's
 * total_amount_decimal (BRIJ's fee is already included); intents expire after
 * ~15 minutes; /air/intents returns customer_support_code inside `intent`.
 */

const API = "https://travel.brij.fi";
const SEARCH_MAX_USD = 0.11;
export const brijEnabled = () => process.env.PRIVI_BRIJ_DISABLED !== "1";

const dec = (s: unknown) => (typeof s === "string" || typeof s === "number" ? Number(s) : NaN);

// --- Flights -----------------------------------------------------------------------

export interface FlightLeg {
  from: string;
  to: string;
  departs: string; // airport-local ISO, no offset
  arrives: string;
  duration: string;
  stops: number;
  via: string[]; // connection airports
  flights: string[];
}

export interface FlightOffer {
  offerId: string;
  /** One leg per direction: outbound, then return on a round trip. */
  legs: FlightLeg[];
  airline: string;
  from: string;
  to: string;
  departs: string; // airport-local ISO, no offset
  arrives: string;
  stops: number;
  duration: string;
  flights: string[]; // e.g. ["F9 2858"]
  fare: string;
  cabin: string;
  checkedBags: number | null;
  refundable: boolean | null;
  changeable: boolean | null;
  totalUsd: number;
  returnDeparts?: string;
  returnArrives?: string;
}

interface RawSegment { carrier_iata?: string; marketing_carrier_iata?: string; flight_number?: string }
interface RawSegmentFull extends RawSegment { origin_iata: string; destination_iata: string }
interface RawSlice { origin_iata?: string; destination_iata?: string; departing_at: string; arriving_at: string; duration?: string; stops?: number; segments?: RawSegmentFull[] }
interface RawOffer {
  id: string;
  owner_name: string;
  origin_iata: string;
  destination_iata: string;
  departing_at: string;
  arriving_at: string;
  stops: number;
  duration: string;
  fare_brand_name: string;
  cabin_class: string;
  checked_bags_included: number | null;
  conditions: { refund_allowed?: boolean | null; change_allowed?: boolean | null } | null;
  segments?: RawSegment[];
  slices?: RawSlice[];
  total_amount_decimal: string;
  total_currency: string;
  identity_documents_required: boolean;
}

const flightNo = (s: RawSegment) => `${s.marketing_carrier_iata ?? s.carrier_iata ?? ""} ${s.flight_number ?? ""}`.trim();

function toLeg(sl: RawSlice): FlightLeg {
  const segs = sl.segments ?? [];
  return {
    from: sl.origin_iata ?? segs[0]?.origin_iata ?? "",
    to: sl.destination_iata ?? segs[segs.length - 1]?.destination_iata ?? "",
    departs: sl.departing_at,
    arrives: sl.arriving_at,
    duration: sl.duration ?? "",
    stops: sl.stops ?? Math.max(0, segs.length - 1),
    via: segs.slice(0, -1).map((s) => s.destination_iata),
    flights: segs.map(flightNo),
  };
}

function toFlight(o: RawOffer): FlightOffer {
  return {
    offerId: o.id,
    legs: (o.slices ?? []).map(toLeg),
    airline: o.owner_name,
    from: o.origin_iata,
    to: o.destination_iata,
    departs: o.departing_at,
    arrives: o.arriving_at,
    stops: o.stops,
    duration: o.duration,
    flights: (o.segments ?? []).map((s) => `${s.marketing_carrier_iata ?? s.carrier_iata ?? ""} ${s.flight_number ?? ""}`.trim()),
    fare: o.fare_brand_name,
    cabin: o.cabin_class,
    checkedBags: o.checked_bags_included,
    refundable: o.conditions?.refund_allowed ?? null,
    changeable: o.conditions?.change_allowed ?? null,
    totalUsd: dec(o.total_amount_decimal),
    returnDeparts: o.slices?.[1]?.departing_at,
    returnArrives: o.slices?.[1]?.arriving_at,
  };
}

export async function searchFlights(q: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  adults: number;
  cabin?: string | null;
  maxStops?: number | null;
  sort?: "price" | "duration" | "departure" | null;
}): Promise<FlightOffer[]> {
  const r = await x402Post(
    `${API}/air/search`,
    {
      origin_iata: q.origin.toUpperCase(),
      destination_iata: q.destination.toUpperCase(),
      depart_date: q.departDate,
      ...(q.returnDate ? { return_date: q.returnDate } : {}),
      adults: q.adults,
      ...(q.cabin ? { cabin_class: q.cabin } : {}),
      ...(q.maxStops != null ? { max_stops: q.maxStops } : {}),
      sort: q.sort ?? "price",
      cheapest_per_itinerary: true,
      // Round trips pair each outbound with several returns: fetch enough to choose both.
      limit: q.returnDate ? 30 : 12,
    },
    { maxUsd: SEARCH_MAX_USD },
  );
  const j = (await r.json()) as { search?: { offers?: RawOffer[]; search_id?: string; status?: string; poll_after_ms?: number } };
  let offers = j.search?.offers ?? [];
  // Slower sellers often add cheaper fares and other airlines: one free follow-up poll.
  if (j.search?.status === "enriching" && j.search.search_id) {
    await new Promise((res) => setTimeout(res, Math.min(j.search?.poll_after_ms ?? 2500, 4000)));
    const u = await fetch(`${API}/air/search-updates`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ search_id: j.search.search_id }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    const uj = u?.ok ? ((await u.json().catch(() => null)) as { search?: { offers?: RawOffer[] }; offers?: RawOffer[] } | null) : null;
    const more = uj?.search?.offers ?? uj?.offers;
    if (more?.length) offers = more;
  }
  return offers
    .filter((o) => !o.identity_documents_required && o.total_currency === "USD")
    .map(toFlight)
    .sort((a, b) => a.totalUsd - b.totalUsd)
    .slice(0, q.returnDate ? 30 : 6);
}

export interface Intent {
  intentId: string;
  supportCode: string;
  escrowBase: string; // USDC base units, as a string (JSON-safe)
  escrowUsd: number;
  ticketUsd: number;
  feeUsd: number;
  passengerCount: number;
  expiresAt: string;
}

interface RawIntent {
  id: string;
  customer_support_code?: string;
  expected_escrow_amount: number;
  expected_ticket_amount?: number;
  fee_amount?: number;
  passenger_count?: number;
  expires_at: string;
  status: string;
  booking_reference?: string;
  refund_reason?: string;
}

function toIntent(i: RawIntent): Intent {
  return {
    intentId: i.id,
    supportCode: i.customer_support_code ?? "",
    escrowBase: String(i.expected_escrow_amount),
    escrowUsd: i.expected_escrow_amount / 1e6,
    ticketUsd: (i.expected_ticket_amount ?? 0) / 1e6,
    feeUsd: (i.fee_amount ?? 0) / 1e6,
    passengerCount: i.passenger_count ?? 1,
    expiresAt: i.expires_at,
  };
}

/** Lock a fare in a funded-later escrow ($0.10). Nothing is booked yet. */
export async function createFlightIntent(offerId: string): Promise<Intent> {
  const wallet = (await spendSigner()).address;
  const r = await x402Post(`${API}/air/intents`, { offer_id: offerId, funding_wallet: wallet }, { maxUsd: SEARCH_MAX_USD });
  return toIntent(((await r.json()) as { intent: RawIntent }).intent);
}

export interface Passenger {
  given_name: string;
  family_name: string;
  born_on: string;
  title: "mr" | "mrs" | "ms" | "miss" | "dr";
  gender: "m" | "f";
  email: string;
  phone_number: string;
}

/**
 * Fund the escrow from the ring (via the spend wallet) and book. Pays exactly
 * the intent's escrow amount, never more.
 */
export async function bookFlight(intent: Intent, passengers: Passenger[], pay: { asset: RingAsset; solBudget: number }): Promise<{ status: string; reference?: string; fundingSignatures: string[] }> {
  return withLock("spend-wallet", async () => {
    const fundingSignatures = await fundSpend(intent.escrowUsd, pay.asset, pay.solBudget);
    const r = await x402Post(
      `${API}/air/book`,
      { intent_id: intent.intentId, passengers },
      { maxUsd: intent.escrowUsd, exactBase: BigInt(intent.escrowBase), timeoutMs: 90_000 },
    );
    const j = (await r.json()) as { intent?: RawIntent };
    return { status: j.intent?.status ?? "active", reference: j.intent?.booking_reference, fundingSignatures };
  });
}

export async function flightStatus(intentId: string): Promise<{ status: string; reference?: string; refundReason?: string }> {
  const r = await fetch(`${API}/air/intents/${encodeURIComponent(intentId)}`, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!r.ok) throw new Error("Couldn't reach the airline booking service.");
  const j = (await r.json()) as { intent?: RawIntent } & RawIntent;
  const i = j.intent ?? j;
  return { status: i.status, reference: i.booking_reference, refundReason: i.refund_reason };
}

// --- Hotels ------------------------------------------------------------------------

export interface HotelHit {
  hotelId: string;
  name: string;
  stars?: number;
  reviewScore?: number;
  address?: string;
  distanceKm?: number;
  photo?: string;
  totalUsd: number; // all-in, from
  amenities?: string[];
}

export async function searchHotels(q: {
  location: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  rooms: number;
  freeCancellationOnly?: boolean | null;
  stars?: number[] | null;
}): Promise<{ nights: number; hotels: HotelHit[] }> {
  const r = await x402Post(
    `${API}/hotels/search`,
    {
      location: q.location,
      check_in_date: q.checkIn,
      check_out_date: q.checkOut,
      adults: q.adults,
      rooms: q.rooms,
      ...(q.freeCancellationOnly ? { free_cancellation_only: true } : {}),
      ...(q.stars?.length ? { stars: q.stars } : {}),
    },
    { maxUsd: SEARCH_MAX_USD },
  );
  const j = (await r.json()) as {
    nights?: number;
    hotels?: { hotel_id: string; name: string; rating?: number; review_score?: number; address?: string; distance_km?: number; photo_url?: string; total_from: string; currency: string; amenities?: string[] }[];
  };
  const hotels = (j.hotels ?? [])
    .filter((h) => h.currency === "USD")
    .map((h) => ({
      hotelId: h.hotel_id,
      name: h.name,
      stars: h.rating,
      reviewScore: h.review_score,
      address: h.address,
      distanceKm: h.distance_km,
      photo: h.photo_url,
      totalUsd: dec(h.total_from),
      amenities: h.amenities?.slice(0, 4),
    }));
  // Cheapest first, but surface well-reviewed places: prefer review ≥ 7.5 in the first slots.
  const good = hotels.filter((h) => (h.reviewScore ?? 0) >= 7.5);
  const rest = hotels.filter((h) => (h.reviewScore ?? 0) < 7.5);
  return { nights: j.nights ?? 0, hotels: [...good, ...rest].slice(0, 8) };
}

export interface HotelRate {
  rateId: string;
  room: string;
  board: string;
  refundable: boolean;
  refundability: string;
  totalUsd: number;
  dueAtHotel?: string; // e.g. "16.00 EUR"
}

export async function hotelRates(hotelId: string): Promise<{ hotel: string; rates: HotelRate[] }> {
  const r = await x402Post(`${API}/hotels/rates`, { hotel_id: hotelId }, { maxUsd: 0.02 });
  const j = (await r.json()) as {
    hotel?: { name?: string };
    room_types?: { name: string; rates: { rate_id: string; board: string; refundable: boolean; refundability: string; price: { total_amount: string; currency: string; due_at_hotel_amount?: string; due_at_hotel_currency?: string } }[] }[];
  };
  const rates: HotelRate[] = [];
  for (const rt of j.room_types ?? []) {
    for (const x of rt.rates) {
      if (x.price.currency !== "USD") continue;
      const due = dec(x.price.due_at_hotel_amount);
      rates.push({
        rateId: x.rate_id,
        room: rt.name,
        board: x.board,
        refundable: x.refundable,
        refundability: x.refundability,
        totalUsd: dec(x.price.total_amount),
        dueAtHotel: due > 0 ? `${x.price.due_at_hotel_amount} ${x.price.due_at_hotel_currency ?? ""}`.trim() : undefined,
      });
    }
  }
  rates.sort((a, b) => a.totalUsd - b.totalUsd);
  return { hotel: j.hotel?.name ?? "Hotel", rates: rates.slice(0, 6) };
}

/** Quote one rate and open its escrow ($0.01 + $0.10). Nothing is booked yet. */
export async function prepareHotel(rateId: string): Promise<{ intent: Intent; hotel: string; room: string; checkIn: string; checkOut: string; nights: number; refundability: string; dueAtHotel?: string }> {
  const q = await x402Post(`${API}/hotels/quote`, { rate_id: rateId }, { maxUsd: 0.02 });
  const quote = (await q.json()) as {
    offer_id: string;
    hotel?: { name?: string };
    room?: { name?: string } | string;
    rate?: { refundability?: string };
    check_in_date: string;
    check_out_date: string;
    nights: number;
    price: { due_at_hotel_amount?: string; due_at_hotel_currency?: string };
  };
  const wallet = (await spendSigner()).address;
  const r = await x402Post(`${API}/hotels/intents`, { offer_id: quote.offer_id, funding_wallet: wallet }, { maxUsd: SEARCH_MAX_USD });
  const raw = (await r.json()) as { intent?: RawIntent } & RawIntent;
  const due = dec(quote.price.due_at_hotel_amount);
  return {
    intent: toIntent(raw.intent ?? raw),
    hotel: quote.hotel?.name ?? "Hotel",
    room: typeof quote.room === "string" ? quote.room : (quote.room?.name ?? "Room"),
    checkIn: quote.check_in_date,
    checkOut: quote.check_out_date,
    nights: quote.nights,
    refundability: quote.rate?.refundability ?? "",
    dueAtHotel: due > 0 ? `${quote.price.due_at_hotel_amount} ${quote.price.due_at_hotel_currency ?? ""}`.trim() : undefined,
  };
}

export async function bookHotel(
  intent: Intent,
  guest: { guests: { given_name: string; family_name: string }[]; email: string; phone_number: string },
  pay: { asset: RingAsset; solBudget: number },
): Promise<{ status: string; fundingSignatures: string[] }> {
  return withLock("spend-wallet", async () => {
    const fundingSignatures = await fundSpend(intent.escrowUsd, pay.asset, pay.solBudget);
    const r = await x402Post(
      `${API}/hotels/book`,
      { intent_id: intent.intentId, ...guest },
      { maxUsd: intent.escrowUsd, exactBase: BigInt(intent.escrowBase), timeoutMs: 90_000 },
    );
    const j = (await r.json()) as { status?: string };
    return { status: j.status ?? "booking", fundingSignatures };
  });
}

export async function hotelStatus(intent: Intent): Promise<{ status: string; reference?: string }> {
  const r = await x402Post(`${API}/hotels/orders`, { intent_id: intent.intentId }, { maxUsd: 0.02, headers: { "X-Customer-Support-Code": intent.supportCode } });
  return r.json().then((j: { status?: string; booking_reference?: string; booking?: { reference?: string } }) => ({
    status: j.status ?? "booking",
    reference: j.booking_reference ?? j.booking?.reference,
  }));
}
