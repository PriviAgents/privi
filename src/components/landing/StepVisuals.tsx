import { ArrowUp, Check, Lock } from "lucide-react";
import { Frame } from "./PrivacyVisuals";

/**
 * Illustrated visuals for the "How it works" steps (Deposit · Ask · Spend),
 * in the same dotted frames as the "Private by design" pillars.
 */

/** The Privacy Ring: a lock inside a slowly turning dashed ring. */
export function DepositVisual() {
  return (
    <Frame>
      <div className="relative flex size-24 items-center justify-center">
        <svg className="sv-spin absolute inset-0" viewBox="0 0 96 96" aria-hidden>
          <circle cx="48" cy="48" r="45" fill="none" stroke="rgba(232,65,37,0.75)" strokeWidth="1.5" strokeDasharray="4 6" />
        </svg>
        <span className="flex size-14 items-center justify-center rounded-full bg-ember text-white shadow-[0_10px_26px_-8px_rgba(232,65,37,0.7)]">
          <Lock size={22} strokeWidth={2.2} />
        </span>
      </div>
    </Frame>
  );
}

/** A request, and at most three options back, the best one picked. */
export function AskVisual() {
  const options = [
    { t: "Nonstop · 9:15 AM", p: "$286", best: true },
    { t: "1 stop · 7:40 AM", p: "$241" },
    { t: "Nonstop · 6:05 PM", p: "$312" },
  ];
  return (
    <Frame>
      <div className="w-[84%]">
        <div className="flex items-center gap-2 rounded-full border border-line bg-white/95 py-1 pl-3 pr-1 shadow-[0_10px_24px_-16px_rgba(0,0,0,0.3)]">
          <span className="flex-1 truncate text-[11.5px]">Flight to Nice on Friday</span>
          <span className="flex size-5 items-center justify-center rounded-full bg-foreground text-white">
            <ArrowUp size={11} strokeWidth={2.6} />
          </span>
        </div>
        <ul className="mt-2 space-y-1">
          {options.map((o) => (
            <li
              key={o.t}
              className={`flex items-center justify-between rounded-lg px-2.5 py-1 text-[11px] ${
                o.best ? "border border-ember/40 bg-white font-medium" : "border border-transparent bg-white/60 text-muted"
              }`}
            >
              <span className="flex items-center gap-1.5">
                {o.best && <span className="sv-best-dot size-1.5 rounded-full bg-ember" />}
                {o.t}
              </span>
              <span className="tabular">{o.p}</span>
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  );
}

/** One confirmed Solana transaction, ring to merchant. */
export function SpendVisual() {
  return (
    <Frame>
      <div className="w-[80%] rounded-xl border border-line bg-white/90 p-3 shadow-[0_10px_28px_-16px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-subtle">Solana transaction</span>
          <span className="sv-confirm inline-flex items-center gap-1 rounded-full bg-ember px-1.5 py-0.5 text-[9.5px] font-medium text-white">
            <Check size={9} strokeWidth={3} /> Confirmed
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
          Privacy Ring <span className="text-subtle">→</span> Merchant
        </div>
        <div className="tabular mt-0.5 text-[18px] font-semibold tracking-tight">286.00 USDC</div>
        <div className="mt-1 font-mono text-[9.5px] text-subtle">5Kx2…9fQ2 · 1 of 1</div>
      </div>
    </Frame>
  );
}
