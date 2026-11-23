"use client";

import { useEffect, useRef, useState } from "react";
import { BedDouble, Gift, Package, Plane, type LucideIcon } from "lucide-react";

/**
 * The hero's centrepiece: a Privacy Ring drawn as stippled line-art in ember.
 *  - a torus of dots, laid out as small cross-section circles around the tube
 *    and shaded by depth so the far side recedes; it spins slowly and tilts
 *    toward the cursor
 *  - three dashed orbits inside the ring; a light ember streak runs along
 *    one, slows to a stop, and a request card pops up there. Six requests take
 *    turns, one at a time; clicking a card hands its text to `onPick`.
 * Reduced motion: a still ring, the card cycles in place without the streak.
 * Pauses off-screen or hidden.
 */
const EMBER = "232,65,37";
const STREAK = "255,138,101"; // lighter ember for the streak
const ORBITS = [0.3, 0.46, 0.62]; // radii, as a fraction of the ring radius

const REQUESTS: { kind: string; icon: LucideIcon; text: string }[] = [
  { kind: "Hotel", icon: BedDouble, text: "Two nights in Tokyo under $300" },
  { kind: "Flight", icon: Plane, text: "Cheapest flight to London tomorrow" },
  { kind: "Gift card", icon: Gift, text: "A $25 Starbucks gift card" },
  { kind: "Store order", icon: Package, text: "Kindle Paperwhite from Amazon" },
  { kind: "Flight", icon: Plane, text: "Round trip NYC to Miami in March" },
  { kind: "Gift card", icon: Gift, text: "$50 Steam card for my brother" },
];

const TRAVEL_PER_RAD = 420; // ms of travel per radian (plus a 700ms base)
const HOLD = 3000; // ms the card stays up
const FADE = 450; // ms between cards

export function HeroRing({ className, onPick }: { className?: string; onPick?: (text: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1;
    let R = 0, r = 0, cx = 0, cy = 0, F = 0;
    let U = 96, V = 26; // samples around the ring / around the tube
    let raf = 0;
    let visible = document.visibilityState === "visible";
    let onScreen = true;
    let last = 0;
    let spin = 0;
    // Tilt (radians): pitch around x, yaw around y. Eased toward the cursor.
    const tilt = { pitch: 1.0, yaw: 0, tp: 1.0, ty: 0 };

    // The streak's cycle: travel → hold (card up) → fade → next request.
    const cycle = { phase: "travel" as "travel" | "hold" | "fade", t0: -1, dur: 0, orbit: 0, from: 0, span: 0, n: 0 };
    // Each run starts where the last one stopped (the first from the far
    // side) and stops on the near half of the orbit (lower on screen), so the
    // card sits over the ring's open centre. Always at least ~1.4 rad of travel.
    let at = -Math.PI / 2;
    const plan = (now: number) => {
      const target = Math.PI * (0.22 + Math.random() * 0.56);
      const TAU = Math.PI * 2;
      let span = (((target - at) % TAU) + TAU) % TAU;
      if (span < 1.4) span += TAU;
      cycle.from = at;
      cycle.span = span;
      cycle.dur = 700 + span * TRAVEL_PER_RAD;
      at = (at + span) % TAU;
      cycle.t0 = now;
      cycle.phase = "travel";
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const small = w < 640;
      R = Math.min(w * (small ? 0.38 : 0.3), h * 0.46, 250);
      r = R * 0.3;
      cx = w / 2;
      cy = h * 0.5;
      F = R * 5;
      U = small ? 72 : 120;
      V = small ? 20 : 30;
    };

    // Rotate (pitch, then yaw) and project a point in the ring's own frame.
    const view = (x0: number, y0: number, z0: number): [number, number, number] => {
      const cp = Math.cos(tilt.pitch), sp = Math.sin(tilt.pitch);
      const y1 = y0 * cp - z0 * sp;
      const z1 = y0 * sp + z0 * cp;
      const cyw = Math.cos(tilt.yaw), syw = Math.sin(tilt.yaw);
      const x2 = x0 * cyw + z1 * syw;
      const z2 = -x0 * syw + z1 * cyw;
      const s = F / (F - z2);
      const depth = (z2 + R + r * 1.4) / (2 * (R + r * 1.4));
      return [cx + x2 * s, cy + y1 * s, Math.max(0, Math.min(1, depth))];
    };
    // Torus point at (u around the ring, v around the tube), with the spin.
    const torus = (u: number, v: number) => {
      const uu = u + spin;
      return view((R + r * Math.cos(v)) * Math.cos(uu), (R + r * Math.cos(v)) * Math.sin(uu), r * Math.sin(v));
    };
    // A point on an inner orbit (flat circle in the ring's plane).
    const orbit = (k: number, a: number) => view(R * k * Math.cos(a), R * k * Math.sin(a), 0);

    // Dots are bucketed by alpha so each bucket fills in one path.
    const BUCKETS = 10;
    const buckets: number[][] = Array.from({ length: BUCKETS }, () => []);
    const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

    const drawRing = () => {
      // Soft ember bloom inside the ring.
      const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.1);
      bloom.addColorStop(0, `rgba(${EMBER},0.07)`);
      bloom.addColorStop(1, `rgba(${EMBER},0)`);
      ctx.fillStyle = bloom;
      ctx.fillRect(cx - R * 1.2, cy - R * 1.2, R * 2.4, R * 2.4);

      // Stippled torus.
      for (const b of buckets) b.length = 0;
      for (let i = 0; i < U; i++) {
        const u = (i / U) * Math.PI * 2;
        for (let j = 0; j < V; j++) {
          const v = (j / V) * Math.PI * 2;
          const [x, y, d] = torus(u, v);
          const a = 0.38 + 0.62 * d;
          const size = 1.1 + 1.4 * d;
          const bi = Math.min(BUCKETS - 1, Math.floor(a * BUCKETS));
          buckets[bi].push(x - size / 2, y - size / 2, size);
        }
      }
      for (let bi = 0; bi < BUCKETS; bi++) {
        const pts = buckets[bi];
        if (!pts.length) continue;
        ctx.fillStyle = `rgba(${EMBER},${(bi + 0.5) / BUCKETS})`;
        ctx.beginPath();
        for (let k = 0; k < pts.length; k += 3) ctx.rect(pts[k], pts[k + 1], pts[k + 2], pts[k + 2]);
        ctx.fill();
      }
    };

    // Inner orbits: dashed hairlines, drawn over the torus so they read.
    const drawOrbits = () => {
      ctx.save();
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.strokeStyle = `rgba(${EMBER},0.42)`;
      for (const k of ORBITS) {
        ctx.beginPath();
        for (let i = 0; i <= 96; i++) {
          const [x, y] = orbit(k, (i / 96) * Math.PI * 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    /** Keep the card pinned to the streak's head, at least 12px inside the edges. */
    const pin = (x: number, y: number) => {
      const a = anchorRef.current;
      if (!a) return;
      const half = ((a.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0) / 2;
      const px = Math.max(half + 12, Math.min(w - half - 12, x));
      a.style.transform = `translate3d(${px.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    };

    const drawStreak = (now: number) => {
      if (cycle.t0 < 0) plan(now);
      const k = ORBITS[cycle.orbit];
      let elapsed = now - cycle.t0;

      if (cycle.phase === "travel" && elapsed >= cycle.dur) {
        cycle.phase = "hold";
        cycle.t0 = now;
        elapsed = 0;
        setShown(true);
      } else if (cycle.phase === "hold" && elapsed >= HOLD) {
        cycle.phase = "fade";
        cycle.t0 = now;
        elapsed = 0;
        setShown(false);
      } else if (cycle.phase === "fade" && elapsed >= FADE) {
        cycle.n += 1;
        cycle.orbit = (cycle.orbit + 1) % ORBITS.length;
        setIdx(cycle.n % REQUESTS.length);
        plan(now);
        elapsed = 0;
      }

      const p = cycle.phase === "travel" ? Math.min(1, elapsed / cycle.dur) : 1;
      const e = easeOut(p);
      const head = cycle.from + cycle.span * e;
      const alpha = cycle.phase === "fade" ? 1 - elapsed / FADE : 1;
      const [hx, hy] = orbit(k, head);
      pin(hx, hy);

      // Tail: long while fast, shrinking to nothing as it stops; never
      // longer than the distance travelled, so it grows out of the start.
      const tail = Math.min(cycle.span * e, 1.4 * Math.pow(1 - e, 0.7));
      if (tail > 0.01) {
        const SEG = 36;
        ctx.lineCap = "round";
        let prev = orbit(k, head - tail);
        for (let s = 1; s <= SEG; s++) {
          const f = s / SEG;
          const pt = orbit(k, head - tail * (1 - f));
          ctx.strokeStyle = `rgba(${STREAK},${0.9 * f * f * alpha})`;
          ctx.lineWidth = 1 + 2.4 * f;
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(pt[0], pt[1]);
          ctx.stroke();
          prev = pt;
        }
      }

      // Head, plus a soft pulse once it has stopped.
      if (cycle.phase !== "travel") {
        const pulse = (elapsed % 1400) / 1400;
        ctx.strokeStyle = `rgba(${EMBER},${0.45 * (1 - pulse) * alpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hx, hy, 4 + pulse * 16, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(${STREAK},${0.22 * alpha})`;
      ctx.beginPath();
      ctx.arc(hx, hy, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${EMBER},${alpha})`;
      ctx.beginPath();
      ctx.arc(hx, hy, 2.6, 0, Math.PI * 2);
      ctx.fill();
    };

    const frame = (now: number) => {
      const dt = Math.min(64, last ? now - last : 16) / 1000;
      last = now;
      if (!reduced) spin += dt * 0.12;
      const ease = 1 - Math.pow(0.02, dt);
      tilt.pitch += (tilt.tp - tilt.pitch) * ease;
      tilt.yaw += (tilt.ty - tilt.yaw) * ease;
      ctx.clearRect(0, 0, w, h);
      drawRing();
      drawOrbits();
      if (!reduced) drawStreak(now);
    };

    // Reduced motion: a still frame with the card parked on the middle orbit,
    // its text changing every few seconds.
    const still = () => {
      frame(performance.now());
      const [x, y] = orbit(ORBITS[1], Math.PI / 2);
      pin(x, y);
    };

    const loop = (now: number) => {
      raf = 0;
      if (!visible || !onScreen) return;
      frame(now);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduced) return;
      if (!raf && visible && onScreen) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };
    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      start();
    };
    const onMove = (e: PointerEvent) => {
      const mx = (e.clientX / window.innerWidth) * 2 - 1;
      const my = (e.clientY / window.innerHeight) * 2 - 1;
      tilt.ty = mx * 0.35;
      tilt.tp = 1.0 + my * 0.16;
    };
    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      start();
    });
    io.observe(canvas);
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced) requestAnimationFrame(still);
    });
    ro.observe(canvas);

    resize();
    let rotate: ReturnType<typeof setInterval> | undefined;
    if (reduced) {
      requestAnimationFrame(() => {
        still();
        setShown(true);
      });
      let n = 0;
      rotate = setInterval(() => setIdx(++n % REQUESTS.length), 4000);
    } else {
      start();
      window.addEventListener("pointermove", onMove, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      if (rotate) clearInterval(rotate);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  const req = REQUESTS[idx];
  return (
    <div className={className}>
      <canvas ref={ref} className="absolute inset-0 size-full" aria-hidden />
      {/* Pinned to the streak's head each frame; the card sits just above it. */}
      <div ref={anchorRef} className="pointer-events-none absolute left-0 top-0 will-change-transform">
        <button
          type="button"
          key={idx}
          tabIndex={shown ? 0 : -1}
          aria-hidden={!shown}
          data-show={shown || undefined}
          onClick={() => onPick?.(req.text)}
          className="ring-card glass glass-strong absolute bottom-4 left-0 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-xl py-2 pl-2 pr-3.5 text-left"
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-ember text-white">
            <req.icon size={14} />
          </span>
          <span className="flex flex-col">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-subtle">{req.kind}</span>
            <span className="text-[13.5px] font-medium leading-tight text-foreground">{req.text}</span>
          </span>
        </button>
      </div>
    </div>
  );
}
