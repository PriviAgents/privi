"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight, Check, User } from "lucide-react";
import { GlassCard, Kicker } from "@/components/ui/glass";
import { PriviMark } from "@/components/ui/logo";

/**
 * Looping demo scene: the user's request pops in, the agent finds a flight,
 * pays from the Privacy Ring, and books — the private balance ticks down.
 * Runs only while `play` is true (it starts from the top each time).
 * Steps: 0 empty · 1 request · 2 found · 3 paying · 4 booked · 5 hold/reset.
 * Reduced-motion users get the finished frame, static.
 */
const PROMPT = "Book a flight to Nice, France.";
const FARE_USD = 286;
const START = 1240; // private USDC balance before the booking
const END = START - FARE_USD;
const TIMELINE = [450, 1400, 1700, 1900, 2800, 700]; // ms per step

const MQ = "(prefers-reduced-motion: reduce)";
const subscribeMotion = (cb: () => void) => {
  const mq = window.matchMedia(MQ);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function HeroDemo({ play = true, glow = false }: { play?: boolean; glow?: boolean }) {
  const [step, setStep] = useState(0);
  const [bal, setBal] = useState(START);
  const reduced = useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(MQ).matches,
    () => false,
  );


  // One scheduler drives the whole loop. Every setState runs inside a timer
  // or rAF callback, never in the effect body.
  useEffect(() => {
    if (reduced || !play) return;
    let stopped = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let raf = 0;
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));

    const enter = (s: number) => {
      if (stopped) return;
      setStep(s);
      if (s === 0) setBal(START);
      if (s === 4) {
        const t0 = performance.now();
        const tick = (now: number) => {
          if (stopped) return;
          const p = Math.min(1, (now - t0) / 1100);
          const e = 1 - Math.pow(1 - p, 3);
          setBal(START - (START - END) * e);
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      }
      later(() => enter((s + 1) % TIMELINE.length), TIMELINE[s]);
    };

    later(() => enter(0), 0);
    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
    };
  }, [reduced, play]);

  const s = reduced ? 4 : step;
  const shownBal = reduced ? END : bal;
  const resetting = s === 5;

  return (
    <div className="relative">
      <GlassCard
        className={`relative z-10 p-5 transition-opacity duration-500 ${resetting ? "opacity-0" : "opacity-100"} ${glow ? "demo-glow" : ""}`}
        aria-label="Example: booking a flight from a private balance"
      >
        <div className="flex items-center justify-between">
          <Kicker>Private balance</Kicker>
          <Kicker>Privacy Ring</Kicker>
        </div>
        <div className="mt-3 flex items-end gap-2">
          <span className="tabular text-[40px] font-semibold leading-none tracking-tight">
            {shownBal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="pb-1 text-sm text-muted">USDC</span>
          <span className="ml-auto pb-1 text-sm text-muted">encrypted on Solana</span>
        </div>

        <div className="my-4 h-px w-full bg-line" />

        <div className="min-h-[196px] space-y-3 text-[13.5px]">
          {/* User prompt */}
          <div className={`scene ${s >= 1 ? "scene-in" : ""}`}>
            <Line who="you">{PROMPT}</Line>
          </div>

          {/* Agent: found */}
          <div className={`scene ${s >= 2 ? "scene-in" : ""}`}>
            <Line who="privi">
              Nonstop to Nice (NCE) · Fri 9:15 AM · <strong>$286.00</strong>. Paying from your private balance.
            </Line>
          </div>

          {/* Payment row */}
          <div className={`scene ${s >= 3 ? "scene-in" : ""}`}>
            <div className="ml-8 rounded-xl border border-line bg-white/60 px-3 py-2.5">
              <div className="flex items-center justify-between text-[13px]">
                <span className="font-medium">Privacy Ring</span>
                <ArrowRight size={13} className="text-subtle" />
                <span className="tabular font-medium">286.00 USDC</span>
              </div>
              <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-black/[0.06]">
                <div className={`h-full rounded-full bg-ember ${s >= 4 ? "w-full" : s === 3 ? "bar-fill" : "w-0"}`} />
              </div>
              <div className="mt-1.5 text-[11px] text-subtle">
                {s >= 4 ? "Settled in one Solana transaction · balance stays encrypted" : "Generating zero-knowledge proof…"}
              </div>
            </div>
          </div>

          {/* Booked */}
          <div className={`scene ${s >= 4 ? "scene-in" : ""}`}>
            <div className="ml-8 flex items-center gap-2 text-[13px]">
              <span className="flex size-5 items-center justify-center rounded-full bg-black text-white">
                <Check size={12} />
              </span>
              <span className="font-medium">Booked</span>
              <span className="font-mono text-[12px] text-muted">NCE-4K2P</span>
              <span className="ml-auto text-[12px] text-subtle">−286.00 USDC</span>
            </div>
          </div>
        </div>
      </GlassCard>
      <div className="absolute -right-10 -top-10 -z-0 size-64 rounded-full bg-black/[0.04] blur-3xl" aria-hidden />
    </div>
  );
}

/** A chat message: yours on the right in a dark bubble, the agent's on the left. */
function Line({ who, children }: { who: "you" | "privi"; children: React.ReactNode }) {
  const you = who === "you";
  return (
    <div className={`flex items-start gap-3 ${you ? "flex-row-reverse pl-10" : "pr-4"}`}>
      <div
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${
          you ? "border border-line-strong bg-white text-foreground/80" : "bg-black text-white"
        }`}
      >
        {you ? <User size={11} strokeWidth={2.4} /> : <PriviMark size={13} inverted />}
      </div>
      <p
        className={`min-h-[1.5em] rounded-2xl px-3 py-1.5 leading-[1.5] ${
          you ? "rounded-tr-md bg-foreground text-white" : "rounded-tl-md bg-black/[0.045] text-foreground/90"
        }`}
      >
        {children}
      </p>
    </div>
  );
}
