"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRightLeft, Lock, MessageSquare } from "lucide-react";
import { LiveGrid, type GridOverlay } from "@/components/ui/LiveGrid";
import { HeroDemo } from "./HeroDemo";

/**
 * Pinned scroll scene. A tall track holds a sticky, full-screen stage:
 *
 *   1. hold     the animated grid with PRIVACY cut out of it; the video plays
 *               through the letters
 *   2. expand   scrolling zooms into the "I" until the video fills the screen
 *   3. reveal   past a threshold the copy and the demo card fade up over it
 *
 * Pinning is plain `position: sticky`. One rAF loop (only while the track is
 * on screen) reads the scroll position, eases toward it, and draws the cutout
 * into the grid's canvas; the reveal is a class toggle with CSS transitions,
 * so it plays forwards and backwards. Reduced motion: no pinning or zoom, the
 * video and copy are simply shown.
 */
const WORD = "PRIVACY";
// Phase boundaries, as fractions of the track's scroll distance.
const ZOOM_START = 0.1;
const ZOOM_END = 0.5;
const REVEAL_AT = 0.58;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (t: number) => t * t * (3 - 2 * t);

export function PrivacyReveal() {
  const trackRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlay = useRef<GridOverlay | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const track = trackRef.current;
    const video = videoRef.current;
    if (!track || !video) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Play the video only while the scene is on screen.
    const vio = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) void video.play().catch(() => {});
      else video.pause();
    });
    vio.observe(track);

    if (reduced) {
      overlay.current = null;
      const id = requestAnimationFrame(() => setRevealed(true));
      return () => {
        cancelAnimationFrame(id);
        vio.disconnect();
      };
    }

    const font = getComputedStyle(document.body).fontFamily;
    let target = 0;
    let shown = 0; // eased progress
    let raf = 0;
    let last = 0;
    let isRevealed = false;

    // The cutout: PRIVACY punched out of the grid canvas, zooming into the "I".
    overlay.current = (ctx, w, h) => {
      const q = smooth(clamp01((shown - ZOOM_START) / (ZOOM_END - ZOOM_START)));
      if (q >= 1) return;
      ctx.save();
      ctx.font = `700 100px ${font}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "-4px";
      const total = ctx.measureText(WORD).width;
      const cap = ctx.measureText("I").actualBoundingBoxAscent;
      // Fit the word to ~84% of the width, and its cap height to ~34% of the height.
      const fs = Math.min((w * 0.84 * 100) / total, (h * 0.34 * 100) / cap);
      const k = fs / 100;
      ctx.font = `700 ${fs}px ${font}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = `${-4 * k}px`;
      const before = ctx.measureText("PR").width;
      const through = ctx.measureText("PRI").width;
      const iMid = (before + through) / 2; // x of the I's centre, from the word's start
      const capH = cap * k;
      const width = total * k;
      // Scale until the I's stem (≈ 0.12 em) covers the screen both ways.
      const sMax = Math.max(w / (fs * 0.12), h / capH) * 1.25;
      const s = Math.exp(Math.log(sMax) * q * q);
      const startX = w / 2 - width / 2 + iMid;
      const x = startX + (w / 2 - startX) * smooth(Math.min(1, q * 2.2));
      const y = h / 2;
      ctx.translate(x, y);
      ctx.scale(s, s);
      ctx.translate(-iMid, capH / 2);
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
      ctx.fillText(WORD, 0, 0);
      // A hairline ember outline while the word is still readable.
      if (q < 0.25) {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = `rgba(232,65,37,${0.55 * (1 - q / 0.25)})`;
        ctx.lineWidth = 1.2 / s;
        ctx.strokeText(WORD, 0, 0);
      }
      ctx.restore();
    };

    const measure = () => {
      const r = track.getBoundingClientRect();
      const distance = r.height - window.innerHeight;
      target = distance > 0 ? clamp01(-r.top / distance) : 0;
    };

    const tick = (now: number) => {
      raf = 0;
      const dt = Math.min(64, last ? now - last : 16) / 1000;
      last = now;
      measure();
      shown += (target - shown) * (1 - Math.pow(0.0005, dt));
      if (Math.abs(target - shown) < 0.0005) shown = target;

      const q = clamp01((shown - ZOOM_START) / (ZOOM_END - ZOOM_START));
      // Fade the grid layer out over the end of the zoom, then hide it.
      const grid = gridRef.current;
      if (grid) {
        const o = q < 0.85 ? 1 : 1 - (q - 0.85) / 0.15;
        grid.style.opacity = o.toFixed(3);
        grid.style.visibility = o <= 0 ? "hidden" : "visible";
      }
      const hint = hintRef.current;
      if (hint) hint.style.opacity = (1 - clamp01(q * 6)).toFixed(3);

      const next = shown >= REVEAL_AT;
      if (next !== isRevealed) {
        isRevealed = next;
        setRevealed(next);
      }
      raf = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        if (!raf) {
          last = 0;
          measure();
          raf = requestAnimationFrame(tick);
        }
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    io.observe(track);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      vio.disconnect();
      overlay.current = null;
    };
  }, []);

  return (
    <section ref={trackRef} id="spend" className="reveal-track relative" aria-label="Spend from a private balance">
      <div className="reveal-stage sticky top-0 h-[100svh] overflow-hidden bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 size-full object-cover"
          muted
          loop
          playsInline
          preload="auto"
          poster="/media/riviera-poster.jpg"
          aria-hidden
        >
          <source src="/media/riviera-960.mp4" type="video/mp4" media="(max-width: 767px)" />
          <source src="/media/riviera-1920.mp4" type="video/mp4" />
        </video>

        {/* Scrim for the copy: dark from the left and the bottom. */}
        <div className="reveal-scrim pointer-events-none absolute inset-0" data-on={revealed || undefined} aria-hidden />

        {/* The grid with PRIVACY cut out of it. */}
        <div ref={gridRef} className="reveal-grid absolute inset-0">
          <LiveGrid solid overlay={overlay} />
          <div
            ref={hintRef}
            className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center font-mono text-[11px] uppercase tracking-[0.18em] text-subtle"
          >
            Scroll to look inside
          </div>
        </div>

        {/* Copy + demo, revealed by scroll. */}
        <div
          className="reveal-copy relative z-10 mx-auto grid h-full max-w-6xl content-center items-center gap-10 px-6 pt-20 sm:px-10 md:grid-cols-[1.1fr_0.9fr] md:gap-12"
          data-on={revealed || undefined}
        >
          <div className="text-white">
            <h2 className="reveal-item text-[40px] font-semibold leading-[1.02] tracking-[-0.035em] sm:text-[60px] md:text-[72px]">
              Spend from a
              <br />
              private balance.
            </h2>
            <p className="reveal-item mt-5 max-w-[32rem] text-[15.5px] leading-[1.6] text-white/80 sm:text-[17px]">
              Hold SOL and USDC in a Helius Privacy Ring, where your balance is encrypted on
              Solana. Tell your agent what you want — a flight, a hotel, dinner — and it finds
              it, pays for it, and confirms it.
            </p>
            <div className="reveal-item mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/75">
              <span className="inline-flex items-center gap-1.5"><Lock size={13} className="text-[#ff8a65]" /> Encrypted balances</span>
              <span className="inline-flex items-center gap-1.5"><ArrowRightLeft size={13} className="text-[#ff8a65]" /> One Solana transaction per payment</span>
              <span className="inline-flex items-center gap-1.5"><MessageSquare size={13} className="text-[#ff8a65]" /> You approve, it executes</span>
            </div>
          </div>
          <div className="reveal-item reveal-card hidden sm:block">
            <HeroDemo play={revealed} glow />
          </div>
        </div>
      </div>
    </section>
  );
}
