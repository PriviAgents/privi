"use client";

import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  BedDouble,
  ChevronRight,
  Gift,
  KeyRound,
  Package,
  Plane,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { Divider, GlassCard, Kicker } from "@/components/ui/glass";
import { timeAgo, usd } from "@/lib/client/format";
import type { ActivityItem, Order } from "@/lib/privi/types";
import { useApp } from "./state";

export function Activity() {
  const { state } = useApp();
  if (!state) return <GlassCard className="h-[400px] animate-pulse p-5" />;

  const open = state.orders.filter((o) => o.status === "awaiting_confirmation");
  const done = state.orders.filter((o) => o.status !== "awaiting_confirmation" && o.status !== "cancelled").slice(0, 6);

  return (
    <GlassCard className="flex flex-col p-5 lg:sticky lg:top-[4.25rem] lg:max-h-[calc(100dvh-5.5rem)]">
      <Kicker>Orders</Kicker>
      <div className="mt-3 space-y-2">
        {open.length === 0 && done.length === 0 && <p className="text-[13px] text-subtle">Nothing yet. Ask the agent to find something.</p>}
        {open.map((o) => (
          <OrderRow key={o.id} order={o} />
        ))}
        {done.map((o) => (
          <OrderRow key={o.id} order={o} />
        ))}
      </div>

      <Divider className="my-4" />

      <Kicker>Activity</Kicker>
      <ul className="scroll-thin mt-3 flex-1 space-y-1 overflow-y-auto pr-1">
        {state.activity.map((a) => {
          const { icon: Icon, tone } = activityIcon(a, state.orders);
          return (
            <li key={a.id} className="flex items-center gap-3 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-black/[0.025]">
              <IconTile icon={Icon} tone={tone} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{a.summary}</div>
                <div className="text-[11.5px] text-subtle">{timeAgo(a.at)}</div>
              </div>
              {a.amount && (
                <span className={`tabular shrink-0 text-[12.5px] font-medium ${a.amount.startsWith("+") ? "text-foreground" : "text-muted"}`}>{a.amount}</span>
              )}
            </li>
          );
        })}
      </ul>
    </GlassCard>
  );
}

type Tone = "ember" | "dark" | "soft";

/** Pick an icon from what happened, not just the event type. */
function activityIcon(a: ActivityItem, orders: Order[]): { icon: LucideIcon; tone: Tone } {
  const s = a.summary.toLowerCase();
  const order = orders.find((o) => a.summary === o.title || a.summary.startsWith(o.title));
  if (s.startsWith("refund") || s.startsWith("unused budget")) return { icon: RotateCcw, tone: "soft" };
  if (a.kind === "deposit") return { icon: ArrowDownToLine, tone: "ember" };
  if (a.kind === "withdraw") return { icon: ArrowUpFromLine, tone: "soft" };
  if (a.kind === "purchase") {
    if (order) return { icon: ORDER_ICON[order.kind] ?? ShoppingBag, tone: "dark" };
    if (/→|flight|airline/.test(s)) return { icon: Plane, tone: "dark" };
    if (/hotel|night|suite|room/.test(s)) return { icon: BedDouble, tone: "dark" };
    if (/gift|card/.test(s)) return { icon: Gift, tone: "dark" };
    return { icon: ShoppingBag, tone: "dark" };
  }
  if (/passkey|account|opened/.test(s)) return { icon: KeyRound, tone: "soft" };
  return { icon: ShieldCheck, tone: "soft" };
}

function IconTile({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) {
  const styles: Record<Tone, string> = {
    ember: "bg-gradient-to-b from-ember to-[#c9361d] text-white shadow-[0_4px_12px_-4px_rgba(232,65,37,0.55),inset_0_1px_0_rgba(255,255,255,0.25)]",
    dark: "bg-gradient-to-b from-[#2a2a2a] to-black text-white shadow-[0_4px_12px_-5px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14)]",
    soft: "border border-line bg-gradient-to-b from-white to-black/[0.03] text-foreground/75 shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
  };
  return (
    <div className={`flex size-8 shrink-0 items-center justify-center rounded-[10px] ${styles[tone]}`}>
      <Icon size={14} strokeWidth={2} />
    </div>
  );
}

const ORDER_ICON: Record<string, LucideIcon> = { flight: Plane, hotel: BedDouble, product: Package, giftcard: Gift, food: ShoppingBag };

function statusTag(o: Order): { label: string; cls: string } {
  switch (o.status) {
    case "fulfilled":
      return { label: "Fulfilled", cls: "bg-ember text-white shadow-[0_2px_8px_-2px_rgba(232,65,37,0.5)]" };
    case "paid":
      return { label: "Processing", cls: "bg-black text-white" };
    case "awaiting_confirmation":
      return { label: "Needs approval", cls: "border border-black/80 text-foreground" };
    case "failed":
      return { label: (o.details as { refunded?: boolean }).refunded ? "Refunded" : "Failed", cls: "bg-red-50 text-danger ring-1 ring-red-200/70" };
    case "cancelled":
      return { label: "Cancelled", cls: "bg-black/[0.05] text-muted" };
    default:
      return { label: String(o.status).replace("_", " "), cls: "bg-black/[0.05] text-muted" };
  }
}

function OrderRow({ order }: { order: Order }) {
  const tag = statusTag(order);
  const Icon = ORDER_ICON[order.kind] ?? ShoppingBag;
  return (
    <Link
      href={`/app/orders/${order.id}`}
      className="group flex items-center gap-3 rounded-2xl border border-line bg-white/70 p-3 shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-[border-color,background-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:border-black/15 hover:bg-white hover:shadow-[0_10px_24px_-14px_rgba(0,0,0,0.25)]"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-line bg-gradient-to-b from-white to-black/[0.03] text-foreground/80">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] font-medium">{order.title}</span>
          <span className="tabular shrink-0 text-[13px] font-semibold">{usd(order.priceUsd)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${tag.cls}`}>{tag.label}</span>
          <span className="inline-flex items-center gap-0.5 truncate text-[11px] text-subtle group-hover:text-foreground">
            {order.merchant} · {timeAgo(order.updatedAt)} <ChevronRight size={11} className="shrink-0" />
          </span>
        </div>
      </div>
    </Link>
  );
}
