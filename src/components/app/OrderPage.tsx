"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Check, Copy, ExternalLink, Gift, Hotel, Loader2, Package, Plane, RefreshCw } from "lucide-react";
import { GlassCard, Kicker, Pill } from "@/components/ui/glass";
import { Logo } from "@/components/ui/logo";
import { num, timeAgo, usd } from "@/lib/client/format";
import type { Order } from "@/lib/privi/types";

type OrderView = Order & { settled: boolean };
type Tracking = { carrier: string; number: string; url?: string; status?: string };

const KIND_ICON = { product: Package, flight: Plane, hotel: Hotel, giftcard: Gift, food: Gift } as const;

export function OrderPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      setChecking(true);
      try {
        const r = await fetch(`/api/orders/${encodeURIComponent(id)}`, { cache: "no-store" });
        const j = await r.json();
        if (!alive) return;
        if (!r.ok) setError(j.error ?? "Couldn't load this order.");
        else {
          setOrder(j.order);
          setError(null);
          setCheckedAt(Date.now());
          if (!j.order.settled) timer = setTimeout(load, j.stale ? 5_000 : 30_000);
        }
      } catch {
        if (alive) timer = setTimeout(load, 10_000);
      } finally {
        if (alive) setChecking(false);
      }
    };
    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  return (
    <div className="flex min-h-dvh flex-col px-3 pb-10 pt-3 sm:px-4">
      <header className="glass mx-auto flex h-13 w-full max-w-[860px] items-center justify-between rounded-2xl px-4">
        <div className="flex items-center gap-3">
          <Link href="/app" className="rounded-full p-1.5 text-muted hover:bg-black/[0.05] hover:text-foreground" aria-label="Back to app">
            <ArrowLeft size={16} />
          </Link>
          <Logo href="/app" />
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-subtle">
          {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {checkedAt ? (order?.settled ? "Final" : "Live · checks every 30s") : "Loading"}
        </span>
      </header>

      <main className="mx-auto mt-4 w-full max-w-[860px] space-y-3">
        {error && <GlassCard className="p-6 text-[14px] text-danger">{error}</GlassCard>}
        {!order && !error && <GlassCard className="h-[420px] animate-pulse" />}
        {order && <OrderDetail order={order} />}
      </main>
    </div>
  );
}

function statusOf(o: OrderView): { label: string; tone: "success" | "danger" | "neutral" | "dark" } {
  const d = o.details as Record<string, unknown>;
  if (o.status === "failed") return { label: d.refunded ? "Refunded" : "Failed", tone: "danger" };
  if (o.status === "cancelled") return { label: "Cancelled", tone: "danger" };
  if (o.status === "awaiting_confirmation") return { label: "Awaiting your approval", tone: "dark" };
  if (o.kind === "product") {
    const t = (d.tracking as Tracking[] | undefined) ?? [];
    if (t.length && t.every((x) => x.status === "delivered")) return { label: "Delivered", tone: "success" };
    if (t.length) return { label: "Shipped", tone: "success" };
    if (o.status === "fulfilled") return { label: "Ordered", tone: "success" };
    return { label: "Placing order", tone: "neutral" };
  }
  if (o.kind === "flight") return d.bookingReference ? { label: "Ticketed", tone: "success" } : { label: "Ticketing", tone: "neutral" };
  if (o.kind === "hotel") return o.status === "fulfilled" ? { label: "Confirmed", tone: "success" } : { label: "Confirming", tone: "neutral" };
  return o.status === "fulfilled" ? { label: "Delivered", tone: "success" } : { label: "Delivering", tone: "neutral" };
}

function steps(o: OrderView): { label: string; done: boolean }[] {
  const d = o.details as Record<string, unknown>;
  const paid = o.status !== "awaiting_confirmation" && o.status !== "cancelled";
  if (o.kind === "product") {
    const t = (d.tracking as Tracking[] | undefined) ?? [];
    return [
      { label: "Paid", done: paid },
      { label: "Ordered from store", done: o.status === "fulfilled" },
      { label: "Shipped", done: t.length > 0 },
      { label: "Delivered", done: t.length > 0 && t.every((x) => x.status === "delivered") },
    ];
  }
  if (o.kind === "flight") return [{ label: "Paid into escrow", done: paid }, { label: "Ticketed by airline", done: Boolean(d.bookingReference) }];
  if (o.kind === "hotel") return [{ label: "Paid into escrow", done: paid }, { label: "Confirmed by hotel", done: o.status === "fulfilled" }];
  return [{ label: "Paid", done: paid }, { label: "Code delivered", done: o.status === "fulfilled" }];
}

function OrderDetail({ order: o }: { order: OrderView }) {
  const d = o.details as Record<string, unknown>;
  const Icon = KIND_ICON[o.kind as keyof typeof KIND_ICON] ?? Package;
  const st = statusOf(o);
  const failed = o.status === "failed" || o.status === "cancelled";
  const tracking = (d.tracking as Tracking[] | undefined) ?? [];
  const sigs = [...((d.fundingSignatures as string[] | undefined) ?? []), ...(typeof d.paymentSignature === "string" ? [d.paymentSignature] : [])];

  return (
    <>
      <GlassCard strong className="p-6 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-black text-white">
            <Icon size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight">{o.title}</h1>
            <p className="mt-1 text-[13.5px] text-muted">
              {o.merchant}
              {o.subtitle ? ` · ${o.subtitle}` : ""}
            </p>
          </div>
          <Pill tone={st.tone}>{st.label}</Pill>
        </div>

        {!failed && (
          <ol className="mt-7 grid gap-3" style={{ gridTemplateColumns: `repeat(${steps(o).length}, minmax(0, 1fr))` }}>
            {steps(o).map((s, i) => (
              <li key={s.label} className="min-w-0">
                <div className={`h-1 rounded-full transition-colors duration-500 ${s.done ? "bg-black" : "bg-black/10"}`} />
                <div className="mt-2 flex items-center gap-1.5 text-[12px]">
                  {s.done ? <Check size={12} /> : <span className="tabular text-subtle">{i + 1}</span>}
                  <span className={`truncate ${s.done ? "font-medium" : "text-subtle"}`}>{s.label}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
        {failed && typeof d.error === "string" && <p className="mt-5 text-[13.5px] text-danger">{d.error}</p>}
      </GlassCard>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-3">
          {o.kind === "product" && <ShipmentCard d={d} tracking={tracking} />}
          {o.kind === "flight" && <FlightCard d={d} />}
          {o.kind === "hotel" && <HotelCard d={d} />}
          {o.kind === "giftcard" && <GiftCard d={d} />}
        </div>

        <GlassCard className="h-fit p-5">
          <Kicker>Payment</Kicker>
          <dl className="mt-3 space-y-2 text-[13px]">
            <Row k="Paid" v={`${num(o.payAmount, o.payAsset === "SOL" ? 4 : 2)} ${o.payAsset}`} />
            <Row k={d.zinc ? "Approved up to" : "Price"} v={usd(o.priceUsd)} />
            {typeof (d.priviFee as { usd?: number } | undefined)?.usd === "number" && <Row k="Privi fee (2%)" v={usd((d.priviFee as { usd: number }).usd)} />}
            {typeof d.totalUsd === "number" && <Row k="Store total" v={usd(d.totalUsd)} />}
            {typeof d.refundUsd === "number" && d.refundUsd > 0 && <Row k="Returned to balance" v={`${usd(d.refundUsd)} USDC`} />}
            <Row k="Order" v={o.reference ?? o.id} mono />
            <Row k="Placed" v={timeAgo(o.createdAt)} />
          </dl>
          {sigs.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <div className="text-[11px] uppercase tracking-[0.12em] text-subtle">On-chain</div>
              <ul className="mt-2 space-y-1">
                {sigs.map((s) => (
                  <li key={s}>
                    <a href={`https://orbmarkets.io/tx/${s}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-mono text-[11.5px] text-muted hover:text-foreground">
                      {s.slice(0, 10)}…{s.slice(-6)} <ExternalLink size={10} />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-[11.5px] leading-[1.5] text-subtle">
            Need help? Message <a className="underline decoration-black/20 underline-offset-2" href="https://x.com/priviagents" target="_blank" rel="noopener noreferrer">@priviagents</a> with order {o.reference ?? o.id}.
          </p>
        </GlassCard>
      </div>
    </>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`tabular truncate text-right ${mono ? "font-mono text-[12px]" : "font-medium"}`}>{v}</dd>
    </div>
  );
}

const TRACK_LABEL: Record<string, string> = {
  pre_transit: "Label created",
  in_transit: "In transit",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  exception: "Delivery issue",
};

function ShipmentCard({ d, tracking }: { d: Record<string, unknown>; tracking: Tracking[] }) {
  const eta = typeof d.estimatedDelivery === "string" ? new Date(`${d.estimatedDelivery.slice(0, 10)}T12:00:00`) : null;
  const ids = (d.merchantOrderIds as string[] | undefined) ?? [];
  const url = (d.zinc as { url?: string } | undefined)?.url;
  return (
    <GlassCard className="p-5">
      <Kicker>Shipping</Kicker>
      {eta && (
        <div className="mt-3">
          <div className="text-[12px] text-muted">Estimated delivery</div>
          <div className="text-[22px] font-semibold tracking-tight">{eta.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</div>
        </div>
      )}
      {tracking.length === 0 && <p className="mt-3 text-[13.5px] text-muted">Tracking appears here as soon as the store ships it.</p>}
      <ul className="mt-4 space-y-2">
        {tracking.map((t) => (
          <li key={t.number} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white/60 px-3.5 py-3">
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium">{TRACK_LABEL[t.status ?? ""] ?? "Shipped"}</div>
              <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[12px] text-muted">
                <span className="capitalize">{t.carrier}</span> {t.number}
                <CopyBtn text={t.number} />
              </div>
            </div>
            {t.url && (
              <a href={t.url} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line px-3 py-1.5 text-[12px] hover:border-black/30">
                Track <ExternalLink size={11} />
              </a>
            )}
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1.5 text-[12.5px]">
        {ids.length > 0 && <Row k="Store order #" v={ids.join(", ")} mono />}
        {url && (
          <div className="flex justify-between gap-3">
            <dt className="text-muted">Product</dt>
            <dd>
              <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 text-foreground underline decoration-black/20 underline-offset-2">
                View listing <ExternalLink size={10} />
              </a>
            </dd>
          </div>
        )}
      </dl>
    </GlassCard>
  );
}

function FlightCard({ d }: { d: Record<string, unknown> }) {
  const f = d.flight as { from: string; to: string; departs: string; arrives: string; airline: string; flights: string[]; fare: string; checkedBags: number | null; refundable: boolean | null } | null;
  const t = (d.travellers as string[] | undefined) ?? [];
  const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return (
    <GlassCard className="p-5">
      <Kicker>Flight</Kicker>
      {typeof d.bookingReference === "string" ? (
        <div className="mt-3 rounded-xl bg-black px-4 py-3 text-white">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/60">Airline confirmation</div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[22px] font-semibold tracking-[0.12em]">
            {d.bookingReference} <CopyBtn text={d.bookingReference} light />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[13.5px] text-muted">Ticketing with the airline. Your confirmation code appears here, usually within a minute.</p>
      )}
      {f && (
        <div className="mt-4 text-[13.5px]">
          <div className="flex items-baseline justify-between">
            <span className="text-[18px] font-semibold">{f.from} → {f.to}</span>
            <span className="text-muted">{f.airline} {f.flights.join(", ")}</span>
          </div>
          <div className="mt-1 text-muted">Departs {when(f.departs)} · arrives {when(f.arrives)} (local times)</div>
          <div className="mt-1 text-muted">{f.fare} · {f.checkedBags ? `${f.checkedBags} checked bag` : "no checked bag"} · {f.refundable ? "refundable" : f.refundable === false ? "non-refundable" : "refund terms per airline"}</div>
        </div>
      )}
      {t.length > 0 && <div className="mt-3 text-[13px] text-muted">Travellers: <span className="text-foreground">{t.join(", ")}</span></div>}
      <p className="mt-3 text-[12px] text-subtle">Check in and manage the booking on the airline&apos;s site with the confirmation code and the lead traveller&apos;s last name.</p>
    </GlassCard>
  );
}

function HotelCard({ d }: { d: Record<string, unknown> }) {
  const s = d.stay as { checkIn: string; checkOut: string; nights: number; room: string; refundability: string; dueAtHotel?: string } | undefined;
  const t = (d.travellers as string[] | undefined) ?? [];
  return (
    <GlassCard className="p-5">
      <Kicker>Stay</Kicker>
      {typeof d.bookingReference === "string" ? (
        <div className="mt-3 rounded-xl bg-black px-4 py-3 text-white">
          <div className="text-[11px] uppercase tracking-[0.14em] text-white/60">Hotel confirmation</div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[20px] font-semibold tracking-[0.1em]">
            {d.bookingReference} <CopyBtn text={d.bookingReference} light />
          </div>
        </div>
      ) : (
        <p className="mt-3 text-[13.5px] text-muted">Confirming with the hotel. The confirmation appears here.</p>
      )}
      {s && (
        <dl className="mt-4 space-y-1.5 text-[13px]">
          <Row k="Check-in" v={s.checkIn} />
          <Row k="Check-out" v={`${s.checkOut} · ${s.nights} night${s.nights === 1 ? "" : "s"}`} />
          <Row k="Room" v={s.room} />
          <Row k="Cancellation" v={s.refundability} />
          {s.dueAtHotel && <Row k="Pay at hotel" v={s.dueAtHotel} />}
        </dl>
      )}
      {t.length > 0 && <div className="mt-3 text-[13px] text-muted">Guest: <span className="text-foreground">{t.join(", ")}</span></div>}
    </GlassCard>
  );
}

function GiftCard({ d }: { d: Record<string, unknown> }) {
  const r = d.redemption as { code?: string; pin?: string; link?: string; instructions?: string } | undefined;
  const [shown, setShown] = useState(false);
  return (
    <GlassCard className="p-5">
      <Kicker>Gift card</Kicker>
      {!r && <p className="mt-3 text-[13.5px] text-muted">Your code is on its way. It appears here as soon as it&apos;s delivered.</p>}
      {r && (
        <div className="mt-3 space-y-2 rounded-xl bg-black px-4 py-3.5 text-white">
          {!shown ? (
            <button onClick={() => setShown(true)} className="cursor-pointer text-[13px] underline decoration-white/30 underline-offset-2">
              Reveal code
            </button>
          ) : (
            <>
              {r.code && (
                <div className="flex items-center gap-2 font-mono text-[15px] tracking-wider">
                  {r.code} <CopyBtn text={r.code} light />
                </div>
              )}
              {r.pin && <div className="font-mono text-[13px] tracking-wider">PIN {r.pin}</div>}
              {r.link && (
                <a href={r.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] underline decoration-white/30 underline-offset-2">
                  Redeem <ExternalLink size={11} />
                </a>
              )}
              {r.instructions && <p className="text-[12px] text-white/70">{r.instructions}</p>}
            </>
          )}
        </div>
      )}
    </GlassCard>
  );
}

function CopyBtn({ text, light }: { text: string; light?: boolean }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setOk(true);
          setTimeout(() => setOk(false), 1400);
        } catch {
          /* clipboard unavailable */
        }
      }}
      aria-label="Copy"
      className={`cursor-pointer rounded p-0.5 ${light ? "text-white/60 hover:text-white" : "text-subtle hover:text-foreground"}`}
    >
      {ok ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}
