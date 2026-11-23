import {
  Lock,
  CalendarCheck,
  Check,
  Package,
  Receipt,
  Scale,
  Search,
  ShoppingBag,
  User,
  Wallet,
} from "lucide-react";
import { Kicker } from "@/components/ui/glass";
import { PriviMark } from "@/components/ui/logo";
import { BRANDS } from "./brands";

/**
 * Interactive showcase: a You → Privi → Merchants flow with travelling pulses
 * and rotating arcs, then a bento with the merchant orbit and the agent's
 * action tiles. All motion is CSS (see globals.css: .connector, .arc, .orbit-*).
 */
export function Showcase() {
  return (
    <section>
      <div className="overflow-hidden">
        {/* Flow */}
        <div className="px-6 pt-10 pb-4 text-center sm:px-10">
          <Kicker>How money moves</Kicker>
          <p className="mx-auto mt-3 max-w-xl text-[17px] leading-[1.55] text-muted">
            <span className="font-semibold text-foreground">You ask. Privi pays.</span> Your
            request goes in, a private payment goes out, and the merchant only ever
            meets the agent.
          </p>
        </div>
        <FlowDiagram />

        {/* Bento */}
        <div className="grid border-t border-line md:grid-cols-2">
          <div className="border-b border-line md:border-b-0 md:border-r">
            <div className="px-6 pt-8 sm:px-10">
              <Kicker>Where</Kicker>
              <p className="mt-3 text-[17px] leading-[1.55] text-muted">
                <span className="font-semibold text-foreground">Anywhere your agent can pay.</span>{" "}
                Hotels, flights, food, everyday shopping — the merchants you already use.
              </p>
            </div>
            <MerchantOrbit />
          </div>
          <div>
            <div className="px-6 pt-8 sm:px-10">
              <Kicker>What it does</Kicker>
              <p className="mt-3 text-[17px] leading-[1.55] text-muted">
                <span className="font-semibold text-foreground">Actions.</span> Search, compare,
                pay, book, track — the whole errand, end to end.
              </p>
            </div>
            <ActionTiles />
          </div>
        </div>
      </div>
    </section>
  );
}

function Node({
  label,
  size = "sm",
  arcs = 1,
  children,
}: {
  label: string;
  size?: "sm" | "lg";
  arcs?: number;
  children: React.ReactNode;
}) {
  const box = size === "lg" ? "size-36 sm:size-44" : "size-24 sm:size-28";
  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative ${box} rounded-2xl border border-line bg-white/70 shadow-[0_1px_0_rgba(255,255,255,0.9)_inset,0_10px_30px_-14px_rgba(0,0,0,0.18)]`}>
        {/* dotted inner grid */}
        <div
          className="absolute inset-3 rounded-xl opacity-60"
          style={{
            backgroundImage: "radial-gradient(rgba(0,0,0,0.12) 1px, transparent 1px)",
            backgroundSize: "10px 10px",
          }}
          aria-hidden
        />
        {/* rotating arcs */}
        <svg className="arc" viewBox="0 0 100 100" style={{ ["--dur" as string]: "9s" }} aria-hidden>
          <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(232,65,37,0.85)" strokeWidth="1.3" strokeDasharray="40 150" strokeLinecap="round" />
        </svg>
        {arcs > 1 && (
          <svg className="arc" data-rev viewBox="0 0 100 100" style={{ ["--dur" as string]: "14s" }} aria-hidden>
            <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="1" strokeDasharray="60 180" strokeLinecap="round" />
          </svg>
        )}
        <div className="absolute inset-0 flex items-center justify-center">{children}</div>
      </div>
      <span className="rounded-full border border-line bg-white/70 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-subtle">
        {label}
      </span>
    </div>
  );
}

function FlowDiagram() {
  return (
    <div className="flex items-center justify-center gap-3 px-6 pb-12 pt-6 sm:gap-6 sm:px-10">
      <Node label="You">
        <div className="flex size-10 items-center justify-center rounded-full bg-black text-white">
          <User size={18} />
        </div>
      </Node>
      <div className="connector w-10 flex-1 sm:w-24" style={{ ["--dur" as string]: "2.4s" }} />
      <Node label="Privi" size="lg" arcs={2}>
        <div className="flex size-14 items-center justify-center rounded-full bg-black">
          <PriviMark size={32} inverted />
        </div>
      </Node>
      <div className="connector w-10 flex-1 sm:w-24" style={{ ["--dur" as string]: "2.4s", ["--delay" as string]: "1.2s" }} />
      <Node label="Merchant">
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex size-7 items-center justify-center rounded-md border border-line bg-white">
            <ShoppingBag size={14} />
          </div>
          <div className="flex size-7 items-center justify-center rounded-md border border-line bg-white">
            <Wallet size={14} />
          </div>
        </div>
      </Node>
    </div>
  );
}

/** Three concentric rings; items are spaced evenly, counter-rotated to stay upright. */
function MerchantOrbit() {
  const rings = [
    { radius: 72, dur: "38s", rev: false, items: BRANDS.slice(0, 5) },
    { radius: 120, dur: "56s", rev: true, items: BRANDS.slice(5, 12) },
    { radius: 168, dur: "74s", rev: false, items: BRANDS.slice(12, 19) },
  ];
  return (
    <div className="orbit relative mx-auto my-8 flex h-[380px] w-full max-w-[380px] items-center justify-center overflow-visible">
      {rings.map((r, i) => (
        <div
          key={i}
          className="orbit-ring"
          data-rev={r.rev || undefined}
          style={{
            width: r.radius * 2,
            height: r.radius * 2,
            left: `calc(50% - ${r.radius}px)`,
            top: `calc(50% - ${r.radius}px)`,
            inset: "auto",
            ["--dur" as string]: r.dur,
          }}
        >
          {r.items.map((b, j) => {
            const angle = (360 / r.items.length) * j;
            return (
              <div
                key={b.name}
                className="orbit-item"
                style={{ transform: `rotate(${angle}deg) translate(0, -${r.radius}px) rotate(-${angle}deg) translate(-50%, -50%)`, left: "50%", top: "50%" }}
              >
                <div
                  className="flex size-9 items-center justify-center rounded-full border border-line bg-white text-foreground/80 shadow-[0_6px_16px_-10px_rgba(0,0,0,0.35)]"
                  title={b.name}
                  style={{ ["--dur" as string]: r.dur }}
                >
                  {b.icon ? (
                    <svg viewBox="0 0 24 24" width={16} height={16} fill="currentColor" aria-hidden>
                      <path d={b.icon.path} />
                    </svg>
                  ) : (
                    <span className="text-[11px] font-bold tracking-tight">{b.short}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {/* centre */}
      <div className="relative z-10 flex h-16 w-24 flex-col justify-between rounded-xl border border-line bg-white p-2 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.3)]">
        <div className="flex items-center gap-1">
          <span className="size-1.5 rounded-full bg-black/20" />
          <span className="size-1.5 rounded-full bg-black/20" />
          <span className="size-1.5 rounded-full bg-black/20" />
        </div>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-1 w-10 rounded bg-black/15" />
            <div className="h-1 w-6 rounded bg-black/10" />
          </div>
          <PriviMark size={18} />
        </div>
      </div>
    </div>
  );
}

function ActionTiles() {
  const actions = [
    { icon: Search, label: "Search" },
    { icon: Scale, label: "Compare" },
    { icon: Lock, label: "Encrypt" },
    { icon: Wallet, label: "Pay" },
    { icon: CalendarCheck, label: "Book" },
    { icon: Package, label: "Track" },
    { icon: Check, label: "Approve" },
    { icon: Receipt, label: "Receipt" },
  ];
  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 border-y border-line px-5 py-2.5">
        <span className="size-2 rounded-full bg-black/15" />
        <span className="size-2 rounded-full bg-black/15" />
        <span className="size-2 rounded-full bg-black/15" />
        <span className="ml-3 flex h-6 flex-1 items-center rounded-md border border-line bg-white/60 px-2 font-mono text-[11px] text-subtle">
          privi · agent
        </span>
      </div>
      <ul className="grid grid-cols-4">
        {actions.map((a, i) => (
          <li
            key={a.label}
            className={`flex flex-col items-center gap-3 py-7 ${i % 4 !== 3 ? "border-r border-line" : ""} ${i < 4 ? "border-b border-line" : ""}`}
          >
            <div className="action-tile flex size-12 items-center justify-center rounded-xl border border-line bg-white/70">
              <a.icon size={18} />
            </div>
            <span className="text-[13px] font-medium">{a.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
