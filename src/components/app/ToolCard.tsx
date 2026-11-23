"use client";

import { useState } from "react";
import { BedDouble, Check, ChevronDown, FileText, Gift, Globe, Hotel, Package, Plane, Receipt, ShoppingBag, Star, Truck, Wallet, X } from "lucide-react";
import { Button, Pill } from "@/components/ui/glass";
import { num, usd } from "@/lib/client/format";
import type { AssetBalance, Order } from "@/lib/privi/types";
import { useApp } from "./state";

export interface ToolBlock {
  type: "tool";
  id: string;
  name: string;
  status: "running" | "done" | "error";
  input?: unknown;
  result?: unknown;
}

interface Offer {
  id: string;
  kind: string;
  title: string;
  subtitle: string;
  merchant: string;
  rail: string;
  priceUsd: number;
}

type IconT = React.ComponentType<{ size?: number; className?: string }>;

/** Running label, finished label, icon. */
const META: Record<string, { run: string; done: string; icon: IconT }> = {
  get_wallet: { run: "Checking your balance", done: "Checked your balance", icon: Wallet },
  search_gift_cards: { run: "Finding gift cards", done: "Found gift cards", icon: Gift },
  web_search: { run: "Searching the web", done: "Searched the web", icon: Globe },
  search_products: { run: "Searching stores", done: "Searched stores", icon: ShoppingBag },
  search_flights: { run: "Searching airlines", done: "Found flights", icon: Plane },
  prepare_flight_booking: { run: "Holding your fare", done: "Fare held", icon: Plane },
  search_hotels: { run: "Searching hotels", done: "Found hotels", icon: Hotel },
  hotel_rooms: { run: "Checking rooms", done: "Rooms and rates", icon: BedDouble },
  prepare_hotel_booking: { run: "Holding your room", done: "Room held", icon: Hotel },
  web_fetch: { run: "Reading the page", done: "Read the page", icon: FileText },
  prepare_purchase: { run: "Preparing your order", done: "Order ready", icon: Receipt },
  prepare_product_order: { run: "Checking the store", done: "Order ready", icon: Package },
  confirm_purchase: { run: "Paying from your Privacy Ring", done: "Paid", icon: Receipt },
  check_order: { run: "Checking delivery", done: "Checked delivery", icon: Receipt },
  cancel_order: { run: "Cancelling", done: "Cancelled", icon: X },
};

/** Short human detail for the activity row (the search query, the page). */
function detailOf(name: string, input: unknown): string | null {
  const i = (input ?? {}) as Record<string, unknown>;
  if (name === "web_search" && typeof i.query === "string") return i.query;
  if (name === "web_fetch" && typeof i.url === "string") {
    try {
      return new URL(i.url).hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }
  if (name === "search_gift_cards" && typeof i.brand === "string") return i.brand;
  if (name === "search_products" && typeof i.query === "string") return i.query;
  if (name === "search_flights" && typeof i.origin === "string") return `${i.origin} → ${i.destination} · ${i.depart_date}`;
  if (name === "search_hotels" && typeof i.location === "string") return `${i.location} · ${i.check_in} → ${i.check_out}`;
  return null;
}

/** Tools whose result is a rich card; the rest render as a single quiet row. */
const RICH = new Set(["search_flights", "prepare_flight_booking", "search_hotels", "hotel_rooms", "prepare_hotel_booking", "search_products", "search_gift_cards", "prepare_purchase", "prepare_product_order", "confirm_purchase", "check_order"]);

export function ToolCard({ block }: { block: ToolBlock }) {
  const meta = META[block.name] ?? { run: "Working", done: "Done", icon: Wallet };
  const r = (block.result ?? {}) as Record<string, unknown>;
  const errored = block.status === "error" || typeof r.error === "string";
  const detail = detailOf(block.name, block.input);
  const rich = RICH.has(block.name) && block.status === "done" && !errored;

  return (
    <div className="msg-in">
      <ActivityRow icon={meta.icon} label={block.status === "running" ? meta.run : meta.done} detail={detail} status={errored ? "error" : block.status} />
      {errored && block.status !== "running" && (
        <p className="ml-7 mt-1 text-[12.5px] text-danger">{String(r.error ?? "Something went wrong. Try again.")}</p>
      )}
      {!errored && block.status === "done" && (block.name === "web_search" || block.name === "web_fetch") && (
        <Sources sources={(r.sources as { title: string; url: string }[]) ?? []} />
      )}
      {rich && (
        <div className="card-in mt-2.5 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
          <Body name={block.name} result={r} />
        </div>
      )}
    </div>
  );
}

function ActivityRow({ icon: Icon, label, detail, status }: { icon: IconT; label: string; detail: string | null; status: ToolBlock["status"] }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 text-[13px]">
      <span className="relative flex size-[18px] shrink-0 items-center justify-center">
        {status === "running" ? (
          <span className="activity-spinner" aria-hidden />
        ) : status === "error" ? (
          <X size={13} className="text-danger" />
        ) : (
          <Icon size={13} className="text-foreground/55" />
        )}
      </span>
      <span className={status === "running" ? "shimmer-text font-medium" : "text-muted"}>{label}</span>
      {detail && <span className="min-w-0 truncate text-subtle">· {detail}</span>}
      {status === "done" && <Check size={12} className="shrink-0 text-foreground/35" />}
    </div>
  );
}

function Sources({ sources }: { sources: { title: string; url: string }[] }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  const shown = open ? sources : sources.slice(0, 3);
  return (
    <div className="ml-7 mt-2 flex flex-wrap items-center gap-1.5">
      {shown.map((s) => {
        let host = s.url;
        try {
          host = new URL(s.url).hostname.replace(/^www\./, "");
        } catch {}
        return (
          <a
            key={s.url}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            title={s.title}
            className="source-chip inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-line bg-white/70 px-2.5 py-1 text-[11.5px] text-muted transition-[border-color,color,transform] hover:-translate-y-px hover:border-black/25 hover:text-foreground"
          >
            <Globe size={10} className="shrink-0 opacity-60" />
            <span className="truncate">{host}</span>
          </a>
        );
      })}
      {sources.length > 3 && (
        <button onClick={() => setOpen((o) => !o)} className="inline-flex cursor-pointer items-center gap-0.5 rounded-full px-2 py-1 text-[11.5px] text-subtle hover:text-foreground">
          {open ? "Less" : `+${sources.length - 3}`}
          <ChevronDown size={11} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}

function Body({ name, result }: { name: string; result: Record<string, unknown> }) {
  switch (name) {
    case "get_wallet":
      return <WalletBody balances={result.balances as AssetBalance[]} totalUsd={result.totalUsd as number} />;
    case "search_flights":
      return <Flights flights={(result.flights as FlightRow[]) ?? []} />;
    case "search_hotels":
      return <Hotels hotels={(result.hotels as HotelRow[]) ?? []} nights={result.nights as number} />;
    case "hotel_rooms":
      return <Rooms rates={(result.rates as RateRow[]) ?? []} />;
    case "prepare_flight_booking":
    case "prepare_hotel_booking":
      return result.order ? <Confirm order={result.order as Order} covered={result.covered !== false} /> : null;
    case "search_products":
      return <Products products={(result.products as ProductHit[]) ?? []} />;
    case "search_gift_cards":
      return <Offers offers={(result.offers as Offer[]) ?? []} />;
    case "prepare_purchase":
    case "prepare_product_order":
      return result.order ? <Confirm order={result.order as Order} covered={result.covered !== false} /> : null;
    case "confirm_purchase":
    case "check_order":
      return result.order ? <ReceiptBody order={result.order as Order} /> : null;
    case "cancel_order":
      return null;
    default:
      return null;
  }
}

function WalletBody({ balances, totalUsd }: { balances: AssetBalance[]; totalUsd: number }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[13px]">
      {balances.map((b) => (
        <span key={b.asset} className="tabular">
          <span className="font-medium">{num(b.amount, b.asset === "SOL" ? 4 : 2)}</span> <span className="text-muted">{b.asset}</span>
        </span>
      ))}
      <span className="tabular ml-auto text-muted">≈ {usd(totalUsd)} private</span>
    </div>
  );
}

function Offers({ offers }: { offers: Offer[] }) {
  const { say } = useApp();
  if (offers.length === 0)
    return <div className="px-4 py-3 text-[13px] text-muted">Nothing in stock for that one. Try another brand.</div>;
  return (
    <ul className="divide-y divide-line">
      {offers.map((o, i) => (
        <li key={o.id} className="offer-row flex items-center gap-3 px-4 py-3 transition-colors hover:bg-black/[0.015]" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium">{o.title}</div>
            <div className="truncate text-[12px] text-muted">{o.subtitle}</div>
            </div>
          <div className="tabular text-right text-[14px] font-semibold">{usd(o.priceUsd)}</div>
          <Button size="sm" variant="outline" onClick={() => say(`Prepare offer ${o.id}`)}>
            Select
          </Button>
        </li>
      ))}
    </ul>
  );
}

function Confirm({ order, covered }: { order: Order; covered: boolean }) {
  const { say, state } = useApp();
  const live = state?.orders.find((o) => o.id === order.id) ?? order;
  const pending = live.status === "awaiting_confirmation";
  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium">{order.title}</div>
          <div className="text-[12px] text-muted">{order.subtitle}</div>
        </div>
        <div className="tabular shrink-0 text-right">
          <div className="text-[16px] font-semibold">{order.details.zinc ? "up to " : ""}{usd(order.priceUsd)}</div>
          <div className="text-[11.5px] text-muted">
            {num(order.payAmount, order.payAsset === "SOL" ? 4 : 2)} {order.payAsset}
          </div>
          {typeof (order.details.priviFee as { usd?: number } | undefined)?.usd === "number" && (
            <div className="text-[11px] text-subtle">incl. 2% Privi fee · {usd((order.details.priviFee as { usd: number }).usd)}</div>
          )}
        </div>
      </div>
      {Array.isArray(order.details.travellers) && (
        <div className="mt-2 text-[12px] text-muted">
          {(order.kind === "hotel" ? "Guest" : "Travellers")}: <span className="text-foreground">{(order.details.travellers as string[]).join(", ")}</span>
        </div>
      )}
      {order.kind === "flight" && Boolean(order.details.flight) && <FareFacts f={order.details.flight as FlightRow} />}
      {order.kind === "hotel" && Boolean(order.details.stay) && (
        <div className="mt-1 text-[12px] text-muted">
          {(order.details.stay as { refundability?: string }).refundability}
          {(order.details.stay as { dueAtHotel?: string }).dueAtHotel ? ` · plus ${(order.details.stay as { dueAtHotel?: string }).dueAtHotel} at the hotel` : ""}
        </div>
      )}
      {Boolean(order.details.zinc) && pending && (
        <div className="mt-2 text-[12px] leading-[1.5] text-muted">Item, tax and shipping are capped; whatever the store total doesn&apos;t use comes back to your balance.</div>
      )}
      {!covered && pending && (
        <div className="mt-2 text-[12px] text-muted">Your private balance doesn&apos;t cover this yet. Deposit from the Funds card, then approve.</div>
      )}
      <div className="mt-3 flex items-center gap-2">
        {pending ? (
          <>
            <Button size="sm" onClick={() => say(`Approve order ${order.id}`)}>
              <Check size={14} /> Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => say(`Decline order ${order.id}`)}>
              Decline
            </Button>
          </>
        ) : (
          <Pill tone={live.status === "fulfilled" || live.status === "paid" ? "success" : "neutral"}>
            {live.status.replace("_", " ")}
          </Pill>
        )}
      </div>
    </div>
  );
}

function ReceiptBody({ order }: { order: Order }) {
  const r = order.details.redemption as { code?: string; pin?: string; link?: string; instructions?: string } | undefined;
  const delivering = order.status === "paid";
  return (
    <div className="px-4 py-3.5 text-[13px]">
      <div className="flex items-center gap-2">
        <Pill tone={order.status === "failed" ? "danger" : "success"}>
          <Check size={11} /> {order.status === "failed" ? "Failed" : delivering ? "Paid · delivering" : "Paid"}
        </Pill>
        <span className="font-mono text-[12px] text-muted">{order.reference}</span>
        {typeof order.details.paymentUrl === "string" && (
          <a href={order.details.paymentUrl} target="_blank" rel="noreferrer" className="ml-auto text-[12px] text-subtle hover:text-foreground">
            Transaction ↗
          </a>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="truncate font-medium">{order.title}</span>
        <span className="tabular ml-3 shrink-0">{num(order.payAmount, order.payAsset === "SOL" ? 4 : 2)} {order.payAsset}</span>
      </div>
      {order.kind === "giftcard" && r && (
        <div className="mt-2.5 space-y-1 rounded-xl bg-black px-3.5 py-2.5 text-white">
          {r.code && <div className="font-mono text-[12.5px] tracking-wider">CODE · {r.code}</div>}
          {r.pin && <div className="font-mono text-[12px] tracking-wider">PIN · {r.pin}</div>}
          {r.link && (
            <a href={r.link} target="_blank" rel="noreferrer" className="block truncate text-[12px] underline underline-offset-2">
              Redeem link
            </a>
          )}
          {r.instructions && <div className="text-[11.5px] text-white/70">{r.instructions}</div>}
        </div>
      )}
      {order.kind === "product" && <ShipmentInfo order={order} />}
      {(order.kind === "flight" || order.kind === "hotel") && <TravelInfo order={order} />}
      {delivering && order.kind === "giftcard" && <div className="mt-2 text-[12px] text-muted">Your code is on its way. Ask Privi to check the order in a minute.</div>}
    </div>
  );
}

const ZINC_LABEL: Record<string, string> = {
  pending: "Placing your order with the store",
  in_progress: "Placing your order with the store",
  order_placed: "Ordered",
  order_failed: "The store couldn't take this order",
  cancelled: "Cancelled",
  cancelled_by_retailer: "Cancelled by the store",
};

function ShipmentInfo({ order }: { order: Order }) {
  const d = order.details as {
    zincStatus?: string;
    tracking?: { carrier: string; number: string; url?: string }[];
    estimatedDelivery?: string;
    refundUsd?: number;
    totalUsd?: number;
  };
  const status = d.zincStatus ?? "pending";
  return (
    <div className="mt-2.5 space-y-1.5 rounded-xl border border-line bg-black/[0.02] px-3.5 py-2.5 text-[12.5px]">
      <div className="flex items-center gap-2">
        <Truck size={13} className="text-foreground/60" />
        <span className="font-medium">{ZINC_LABEL[status] ?? status}</span>
        {d.estimatedDelivery && <span className="text-muted">· arrives by {new Date(d.estimatedDelivery).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>}
      </div>
      {typeof d.totalUsd === "number" && <div className="text-muted">Store total {usd(d.totalUsd)}{d.refundUsd ? ` · ${usd(d.refundUsd)} back to your balance` : ""}</div>}
      {!d.totalUsd && d.refundUsd ? <div className="text-muted">{usd(d.refundUsd)} refunded to your balance</div> : null}
      {d.tracking?.map((t) => (
        <a key={t.number} href={t.url ?? "#"} target="_blank" rel="noopener noreferrer" className="block text-muted underline decoration-black/20 underline-offset-2 hover:text-foreground">
          {t.carrier} {t.number}
        </a>
      ))}
      {(status === "pending" || status === "in_progress") && <div className="text-subtle">Usually takes a few minutes. Ask Privi to check on it.</div>}
    </div>
  );
}

interface ProductHit {
  title: string;
  retailer: string;
  url: string;
  priceUsd: number;
  image?: string;
  rating?: number;
  reviews?: number;
  freeShipping?: boolean;
}

function Products({ products }: { products: ProductHit[] }) {
  const { say } = useApp();
  if (!products.length) return <div className="px-4 py-3 text-[13px] text-muted">No in-stock matches. Try different words.</div>;
  return (
    <ul className="divide-y divide-line">
      {products.slice(0, 4).map((p, i) => (
        <li key={p.url} className="offer-row flex items-center gap-3 px-4 py-3" style={{ animationDelay: `${i * 60}ms` }}>
          {p.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.image} alt="" referrerPolicy="no-referrer" loading="lazy" className="size-12 shrink-0 rounded-lg border border-line bg-white object-contain p-1" />
          ) : (
            <div className="size-12 shrink-0 rounded-lg border border-line bg-black/[0.02]" />
          )}
          <div className="min-w-0 flex-1">
            <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="line-clamp-2 text-[13.5px] font-medium leading-snug hover:underline hover:decoration-black/30 hover:underline-offset-2">
              {p.title}
            </a>
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
              <span className="capitalize">{p.retailer.replace(/_/g, " ")}</span>
              {typeof p.rating === "number" && (
                <span className="inline-flex items-center gap-0.5">
                  <Star size={10} className="fill-current" /> {p.rating.toFixed(1)}
                  {p.reviews ? <span className="text-subtle">({p.reviews.toLocaleString()})</span> : null}
                </span>
              )}
              {p.freeShipping && <span className="text-subtle">Free shipping</span>}
            </div>
          </div>
          <div className="tabular shrink-0 text-right text-[14px] font-semibold">{usd(p.priceUsd)}</div>
          <Button size="sm" variant="outline" onClick={() => say(`Order the "${p.title}" from ${p.retailer} (${p.url})`)}>
            Order
          </Button>
        </li>
      ))}
    </ul>
  );
}

interface FlightRow {
  offerId: string;
  legs?: LegRow[];
  airline: string;
  from: string;
  to: string;
  departs: string;
  arrives: string;
  stops: number;
  duration: string;
  flights: string[];
  fare: string;
  checkedBags: number | null;
  refundable: boolean | null;
  totalUsd: number;
  returnDeparts?: string;
}

const hhmm = (iso: string) => iso.slice(11, 16);
const dayOf = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
/** ISO 8601 duration (e.g. PT11H15M, P1DT2H35M) → "11h 15m" / "26h 35m". */
const dur = (iso: string) => {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/.exec(iso);
  if (!m) return iso;
  const h = Number(m[1] ?? 0) * 24 + Number(m[2] ?? 0);
  const min = Number(m[3] ?? 0);
  return h ? (min ? `${h}h ${min}m` : `${h}h`) : `${min}m`;
};

function FareFacts({ f }: { f: FlightRow }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 text-[12px] text-muted">
      <span>{f.fare}</span>
      <span>{f.checkedBags == null ? "Bags: ask airline" : f.checkedBags === 0 ? "No checked bag" : `${f.checkedBags} checked bag${f.checkedBags > 1 ? "s" : ""}`}</span>
      <span className={f.refundable === false ? "text-foreground" : ""}>{f.refundable === true ? "Refundable" : f.refundable === false ? "Non-refundable" : "Refund terms: airline didn't say"}</span>
    </div>
  );
}

interface LegRow {
  from: string;
  to: string;
  departs: string;
  arrives: string;
  duration: string;
  stops: number;
  via: string[];
  flights: string[];
}

const plusDays = (a: string, b: string) => {
  const d = Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86_400_000);
  return d > 0 ? `+${d}` : "";
};

function LegLine({ leg, airline }: { leg: LegRow; airline?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[15px] font-semibold">{hhmm(leg.departs)}</span>
        <span className="text-[12px] text-subtle">{leg.from}</span>
        <span className="relative h-px w-8 bg-line-strong">
          {leg.stops > 0 && <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/50" />}
        </span>
        <span className="tabular text-[15px] font-semibold">
          {hhmm(leg.arrives)}
          <sup className="ml-0.5 text-[10px] font-medium text-subtle">{plusDays(leg.departs, leg.arrives)}</sup>
        </span>
        <span className="text-[12px] text-subtle">{leg.to}</span>
      </div>
      <div className="mt-0.5 truncate text-[12px] text-muted">
        {airline ? `${airline} · ` : ""}
        {dayOf(leg.departs)} · {dur(leg.duration)} · {leg.stops === 0 ? "Nonstop" : `${leg.stops} stop${leg.stops > 1 ? "s" : ""} via ${leg.via.join(", ")}`}
      </div>
    </div>
  );
}

const legKey = (l: LegRow) => `${l.departs}|${l.flights.join(",")}`;
const fareLine = (f: FlightRow) =>
  `${f.fare} · ${f.checkedBags ? `${f.checkedBags} checked bag` : "carry-on only"} · ${f.refundable ? "refundable" : f.refundable === false ? "non-refundable" : "terms vary"}`;

/**
 * Flight picker. One-way: pick a fare, confirm. Round trip (fares cover both
 * directions): pick an outbound, then one of the returns that pair with it,
 * then confirm. Nothing is sent to the agent until the user confirms.
 */
function Flights({ flights }: { flights: FlightRow[] }) {
  const { say } = useApp();
  const [outKey, setOutKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<FlightRow | null>(null);
  const [sent, setSent] = useState(false);
  if (!flights.length) return <div className="px-4 py-3 text-[13px] text-muted">No bookable fares. Try nearby dates.</div>;

  const legsOf = (f: FlightRow): LegRow[] =>
    f.legs?.length ? f.legs : [{ from: f.from, to: f.to, departs: f.departs, arrives: f.arrives, duration: f.duration, stops: f.stops, via: [], flights: f.flights }];
  const roundTrip = legsOf(flights[0]).length > 1;

  // Group fares by outbound flight; each group's price is its cheapest pairing.
  const groups = new Map<string, { leg: LegRow; airline: string; fares: FlightRow[] }>();
  for (const f of flights) {
    const leg = legsOf(f)[0];
    const k = legKey(leg);
    const g = groups.get(k) ?? { leg, airline: f.airline, fares: [] };
    g.fares.push(f);
    groups.set(k, g);
  }
  const outbounds = [...groups.entries()].map(([k, g]) => ({ k, ...g, from: Math.min(...g.fares.map((x) => x.totalUsd)) })).sort((a, b) => a.from - b.from);
  const group = outKey ? groups.get(outKey) : undefined;

  const send = (f: FlightRow) => {
    const legs = legsOf(f);
    const desc = legs.map((l, i) => `${i === 0 ? "outbound" : "return"} ${l.from}→${l.to} ${l.departs.slice(0, 16).replace("T", " ")}`).join(", ");
    setSent(true);
    say(`Book this ${f.airline} fare: ${desc}, ${usd(f.totalUsd)} total (offer ${f.offerId})`);
  };

  // Step 3: confirm the full choice.
  if (picked) {
    const legs = legsOf(picked);
    return (
      <div className="card-in px-4 py-4">
        <div className="space-y-3">
          {legs.map((l, i) => (
            <div key={i}>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">{i === 0 ? "Outbound" : "Return"}</div>
              <LegLine leg={l} airline={picked.airline} />
            </div>
          ))}
        </div>
        <div className="mt-3 text-[12px] text-muted">{fareLine(picked)}</div>
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
          <div>
            <div className="text-[11px] text-subtle">{roundTrip ? "Round trip, all travellers" : "Total, all travellers"}</div>
            <div className="tabular text-[18px] font-semibold">{usd(picked.totalUsd)}</div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" disabled={sent} onClick={() => setPicked(null)}>
              Back
            </Button>
            <Button size="sm" disabled={sent} onClick={() => send(picked)}>
              {sent ? "Sent" : "Confirm flights"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Step 2 (round trip): returns that pair with the chosen outbound.
  if (roundTrip && group) {
    const fares = [...group.fares].sort((a, b) => a.totalUsd - b.totalUsd);
    return (
      <div className="card-in">
        <div className="flex items-center gap-3 border-b border-line bg-black/[0.02] px-4 py-3">
          <button onClick={() => setOutKey(null)} className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-line bg-white px-2.5 py-1 text-[12px] hover:border-black/30">
            <ChevronDown size={12} className="rotate-90" /> Outbound
          </button>
          <div className="min-w-0 flex-1 truncate text-[12px] text-muted">
            {group.airline} · {hhmm(group.leg.departs)} {group.leg.from} → {hhmm(group.leg.arrives)} {group.leg.to}
          </div>
        </div>
        <div className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">Choose your return</div>
        <ul className="divide-y divide-line">
          {fares.map((f, i) => {
            const ret = legsOf(f)[1];
            return (
              <li key={f.offerId} className="offer-row flex items-center gap-4 px-4 py-3" style={{ animationDelay: `${i * 50}ms` }}>
                <div className="min-w-0 flex-1">
                  <LegLine leg={ret} airline={f.airline} />
                  <div className="mt-0.5 text-[11.5px] text-subtle">{fareLine(f)}</div>
                </div>
                <div className="tabular shrink-0 text-right">
                  <div className="text-[15px] font-semibold">{usd(f.totalUsd)}</div>
                  <div className="text-[10.5px] text-subtle">round trip</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setPicked(f)}>
                  Select
                </Button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // Step 1: outbound flights (or one-way fares).
  return (
    <div>
      {roundTrip && <div className="px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">Choose your outbound flight</div>}
      <ul className="divide-y divide-line">
        {(roundTrip ? outbounds : flights.map((f) => ({ k: f.offerId, leg: legsOf(f)[0], airline: f.airline, fares: [f], from: f.totalUsd }))).slice(0, 8).map((o, i) => (
          <li key={o.k} className="offer-row flex items-center gap-4 px-4 py-3" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="min-w-0 flex-1">
              <LegLine leg={o.leg} airline={o.airline} />
              {!roundTrip && <div className="mt-0.5 text-[11.5px] text-subtle">{fareLine(o.fares[0])}</div>}
              {roundTrip && <div className="mt-0.5 text-[11.5px] text-subtle">{o.fares.length} return option{o.fares.length === 1 ? "" : "s"}</div>}
            </div>
            <div className="tabular shrink-0 text-right">
              {roundTrip && <div className="text-[10.5px] text-subtle">from</div>}
              <div className="text-[15px] font-semibold">{usd(o.from)}</div>
              {roundTrip && <div className="text-[10.5px] text-subtle">round trip</div>}
            </div>
            <Button size="sm" variant="outline" onClick={() => (roundTrip ? setOutKey(o.k) : setPicked(o.fares[0]))}>
              {roundTrip ? "Returns" : "Select"}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface HotelRow {
  hotelId: string;
  name: string;
  stars?: number;
  reviewScore?: number;
  distanceKm?: number;
  photo?: string;
  totalUsd: number;
}

function Hotels({ hotels, nights }: { hotels: HotelRow[]; nights?: number }) {
  const { say } = useApp();
  if (!hotels.length) return <div className="px-4 py-3 text-[13px] text-muted">No hotels found for those dates.</div>;
  return (
    <ul className="divide-y divide-line">
      {hotels.slice(0, 5).map((h, i) => (
        <li key={h.hotelId} className="offer-row flex items-center gap-3 px-4 py-3" style={{ animationDelay: `${i * 60}ms` }}>
          {h.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={h.photo} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
          ) : (
            <div className="h-14 w-20 shrink-0 rounded-lg bg-black/[0.04]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium">{h.name}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted">
              {h.stars ? <span>{"★".repeat(h.stars)}</span> : null}
              {h.reviewScore ? <span className="rounded bg-black px-1 text-[10.5px] font-semibold text-white">{h.reviewScore.toFixed(1)}</span> : null}
              {typeof h.distanceKm === "number" && <span>{h.distanceKm.toFixed(1)} km from centre</span>}
            </div>
          </div>
          <div className="tabular shrink-0 text-right">
            <div className="text-[11px] text-subtle">from</div>
            <div className="text-[15px] font-semibold">{usd(h.totalUsd)}</div>
            {nights ? <div className="text-[11px] text-subtle">{nights} night{nights === 1 ? "" : "s"}</div> : null}
          </div>
          <Button size="sm" variant="outline" onClick={() => say(`Show rooms at ${h.name} (hotel ${h.hotelId})`)}>
            Rooms
          </Button>
        </li>
      ))}
    </ul>
  );
}

interface RateRow {
  rateId: string;
  room: string;
  board: string;
  refundable: boolean;
  refundability: string;
  totalUsd: number;
  dueAtHotel?: string;
}

function Rooms({ rates }: { rates: RateRow[] }) {
  const { say } = useApp();
  if (!rates.length) return <div className="px-4 py-3 text-[13px] text-muted">No rooms available in USD for these dates.</div>;
  return (
    <ul className="divide-y divide-line">
      {rates.map((r, i) => (
        <li key={r.rateId} className="offer-row flex items-center gap-3 px-4 py-3" style={{ animationDelay: `${i * 60}ms` }}>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-medium">{r.room}</div>
            <div className="mt-0.5 text-[12px] text-muted">
              {r.board} · <span className={r.refundable ? "" : "text-foreground"}>{r.refundability}</span>
              {r.dueAtHotel ? ` · +${r.dueAtHotel} at hotel` : ""}
            </div>
          </div>
          <div className="tabular shrink-0 text-[15px] font-semibold">{usd(r.totalUsd)}</div>
          <Button size="sm" variant="outline" onClick={() => say(`Book the ${r.room} (${r.board}) rate ${r.rateId}`)}>
            Book
          </Button>
        </li>
      ))}
    </ul>
  );
}

function TravelInfo({ order }: { order: Order }) {
  const d = order.details as { bookingReference?: string; brijStatus?: string; refundUsd?: number };
  const pending = !d.bookingReference && order.status === "paid";
  return (
    <div className="mt-2.5 space-y-1 rounded-xl border border-line bg-black/[0.02] px-3.5 py-2.5 text-[12.5px]">
      {d.bookingReference ? (
        <div className="flex items-center gap-2">
          <span className="text-muted">{order.kind === "flight" ? "Airline confirmation" : "Hotel confirmation"}</span>
          <span className="font-mono text-[13px] font-semibold tracking-wider">{d.bookingReference}</span>
        </div>
      ) : null}
      {pending && <div className="text-muted">{order.kind === "flight" ? "Ticketing with the airline. Usually under a minute." : "Confirming with the hotel."} Ask Privi to check on it.</div>}
      {d.refundUsd ? <div className="text-muted">Not booked. {usd(d.refundUsd)} returned to your balance.</div> : null}
      {d.bookingReference && <div className="text-subtle">Confirmation email goes to the lead {order.kind === "flight" ? "traveller" : "guest"}.</div>}
    </div>
  );
}
