"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * Animated blueprint grid for a section background. Fills its positioned
 * parent (absolute, inset 0); drop it in as the first child of a `relative`
 * section. Ink + one ember accent.
 *  - hairline cells centred on the viewport, dots at cell centres
 *  - the cursor carries an ember spotlight: nearby lines warm up, dots lean
 *    away from it and glow; the grid drifts a few px against it (parallax)
 *  - ember signals run along grid lines, turning at intersections now and then
 *  - a click sends a ripple through the dots
 *  - a slow pulse travels across the dots; highlighted cells hop
 * Masked to fade at the edges. Draws one static frame under reduced-motion,
 * pauses while the tab is hidden or the section is off-screen.
 *
 * `ambient={false}` keeps only the cursor effects (spotlight, warm lines, dots
 * leaning and glowing, parallax): the grid is still and the canvas redraws only
 * while the cursor moves. `hoverWithin` (an element id) limits the cursor
 * effects to when the pointer is over that element.
 *
 * `solid` paints a white ground (and drops the edge fade) so the grid can sit
 * over other content; `overlay` is called at the end of every frame to draw on
 * top, e.g. a `destination-out` cutout that lets what's underneath show through.
 */
export type GridOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
const CELL = 112;
const INK = "0,0,0";
const EMBER = "232,65,37"; // Helius brand orange, #E84125
const REACH = 280; // cursor influence radius, px

type Hop = { cx: number; cy: number; tx: number; ty: number; t0: number; dur: number; next: number; ember: boolean };
/** A signal travelling along a grid line. `pos` is px along the line; `line` its index. */
type Signal = { axis: "h" | "v"; line: number; pos: number; dir: 1 | -1; speed: number; len: number; trail: [number, number][] };
type Ripple = { x: number; y: number; t0: number };

export function LiveGrid({
  className,
  ambient = true,
  hoverWithin,
  solid = false,
  overlay,
}: {
  className?: string;
  ambient?: boolean;
  hoverWithin?: string;
  solid?: boolean;
  overlay?: RefObject<GridOverlay | null>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const el = wrap.current;
    if (!canvas || !el) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    let w = 0, h = 0, dpr = 1, ox = 0, oy = 0, cols = 0, rows = 0;
    let raf = 0;
    let visible = document.visibilityState === "visible";
    let onScreen = true;
    const rand = (a: number, b: number) => a + Math.random() * (b - a);

    const hops: Hop[] = [];
    const signals: Signal[] = [];
    const ripples: Ripple[] = [];
    // Pointer: target (tx,ty) and smoothed (x,y); `presence` fades in/out.
    const ptr = { x: 0, y: 0, tx: 0, ty: 0, presence: 0, want: 0 };
    let last = 0;
    let nextSignal = 0;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = el.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Centre the grid so a line passes through the section centre.
      ox = (w / 2) % CELL;
      oy = (h / 2) % CELL;
      cols = Math.ceil(w / CELL) + 2;
      rows = Math.ceil(h / CELL) + 2;
      if (!hops.length) {
        ptr.x = ptr.tx = w / 2;
        ptr.y = ptr.ty = h * 0.4;
        for (let i = 0; i < 3; i++) {
          const cx = Math.floor(rand(1, cols - 2));
          const cy = Math.floor(rand(1, rows - 2));
          hops.push({ cx, cy, tx: cx, ty: cy, t0: 0, dur: 900, next: rand(500, 2500), ember: i === 0 });
        }
      }
      signals.length = 0;
    };

    const spawnSignal = () => {
      const axis = Math.random() < 0.5 ? "h" : "v";
      const dir = Math.random() < 0.5 ? 1 : -1;
      const span = axis === "h" ? w : h;
      signals.push({
        axis,
        line: Math.floor(rand(1, (axis === "h" ? rows : cols) - 1)),
        pos: dir === 1 ? -40 : span + 40,
        dir,
        speed: rand(140, 260),
        len: rand(110, 200),
        trail: [],
      });
    };

    const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

    const gridPath = (gx: number, gy: number) => {
      ctx.beginPath();
      for (let x = gx - CELL; x <= w + CELL; x += CELL) {
        const px = Math.round(x) + 0.5;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, h);
      }
      for (let y = gy - CELL; y <= h + CELL; y += CELL) {
        const py = Math.round(y) + 0.5;
        ctx.moveTo(0, py);
        ctx.lineTo(w, py);
      }
    };

    const frame = (now: number) => {
      const dt = Math.min(64, last ? now - last : 16) / 1000;
      last = now;
      ctx.clearRect(0, 0, w, h);
      if (solid) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
      }

      // Smooth the pointer; presence eases toward whether it's on the page.
      const k = 1 - Math.pow(0.0015, dt);
      ptr.x += (ptr.tx - ptr.x) * k;
      ptr.y += (ptr.ty - ptr.y) * k;
      ptr.presence += (ptr.want - ptr.presence) * (1 - Math.pow(0.02, dt));
      const pres = reduced ? 0 : ptr.presence;

      // Parallax: the grid drifts a little against the cursor.
      const gx = ox - ((ptr.x - w / 2) / w) * 14 * pres;
      const gy = oy - ((ptr.y - h / 2) / h) * 14 * pres;

      // Ember spotlight under the cursor.
      if (pres > 0.01) {
        const glow = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, REACH * 1.25);
        glow.addColorStop(0, `rgba(${EMBER},${0.07 * pres})`);
        glow.addColorStop(1, `rgba(${EMBER},0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(ptr.x - REACH * 1.3, ptr.y - REACH * 1.3, REACH * 2.6, REACH * 2.6);
      }

      // Grid lines, then the same lines again warmed near the cursor.
      ctx.lineWidth = 1;
      gridPath(gx, gy);
      ctx.strokeStyle = `rgba(${INK},0.075)`;
      ctx.stroke();
      if (pres > 0.01) {
        const warm = ctx.createRadialGradient(ptr.x, ptr.y, 0, ptr.x, ptr.y, REACH);
        warm.addColorStop(0, `rgba(${EMBER},${0.55 * pres})`);
        warm.addColorStop(0.55, `rgba(${EMBER},${0.16 * pres})`);
        warm.addColorStop(1, `rgba(${EMBER},0)`);
        ctx.strokeStyle = warm;
        ctx.stroke();
      }

      // Highlight cells (hopping); one of them is ember.
      for (const hp of ambient ? hops : []) {
        if (!reduced && now >= hp.next) {
          const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
          const [dx, dy] = dirs[Math.floor(rand(0, 4))];
          hp.cx = hp.tx;
          hp.cy = hp.ty;
          hp.tx = Math.min(cols - 2, Math.max(0, hp.tx + dx));
          hp.ty = Math.min(rows - 2, Math.max(0, hp.ty + dy));
          hp.t0 = now;
          hp.next = now + hp.dur + rand(1200, 2600);
        }
        const p = reduced ? 1 : Math.min(1, (now - hp.t0) / hp.dur);
        const e = easeInOut(p);
        const cx = gx - CELL + (hp.cx + (hp.tx - hp.cx) * e) * CELL;
        const cy = gy - CELL + (hp.cy + (hp.ty - hp.cy) * e) * CELL;
        const rgb = hp.ember ? EMBER : INK;
        ctx.fillStyle = `rgba(${rgb},${hp.ember ? 0.05 : 0.045})`;
        ctx.fillRect(cx + 1, cy + 1, CELL - 1, CELL - 1);
        // Small inner square, like a cursor.
        ctx.fillStyle = `rgba(${rgb},${hp.ember ? 0.4 : 0.1})`;
        const q = 10;
        ctx.fillRect(cx + CELL / 2 - q / 2, cy + CELL / 2 - q / 2, q, q);
      }

      // Signals running along grid lines with a fading tail.
      if (ambient && !reduced) {
        if (now >= nextSignal && signals.length < 5) {
          spawnSignal();
          nextSignal = now + rand(900, 2200);
        }
        for (let i = signals.length - 1; i >= 0; i--) {
          const s = signals[i];
          const prev = s.pos;
          s.pos += s.dir * s.speed * dt;
          // Crossed an intersection: sometimes turn onto the crossing line.
          const origin = s.axis === "h" ? gx : gy;
          const a = Math.floor((prev - origin) / CELL);
          const b = Math.floor((s.pos - origin) / CELL);
          let x = s.axis === "h" ? s.pos : gx - CELL + s.line * CELL;
          let y = s.axis === "h" ? gy - CELL + s.line * CELL : s.pos;
          if (a !== b && Math.random() < 0.22) {
            // Crossed the line at origin + max(a,b)·CELL, whose index is max(a,b) + 1.
            const here = s.axis === "h" ? y : x;
            s.axis = s.axis === "h" ? "v" : "h";
            s.line = Math.max(a, b) + 1;
            s.pos = here;
            s.dir = Math.random() < 0.5 ? 1 : -1;
            x = s.axis === "h" ? s.pos : gx - CELL + s.line * CELL;
            y = s.axis === "h" ? gy - CELL + s.line * CELL : s.pos;
          }
          s.trail.push([x, y]);
          // Keep the tail at about `len` px.
          let total = 0;
          for (let t = s.trail.length - 1; t > 0; t--) {
            total += Math.abs(s.trail[t][0] - s.trail[t - 1][0]) + Math.abs(s.trail[t][1] - s.trail[t - 1][1]);
            if (total > s.len) {
              s.trail.splice(0, t - 1);
              break;
            }
          }
          if (x < -s.len - 60 || x > w + s.len + 60 || y < -s.len - 60 || y > h + s.len + 60) {
            signals.splice(i, 1);
            continue;
          }
          const n = s.trail.length;
          ctx.lineCap = "round";
          for (let t = 1; t < n; t++) {
            const f = t / n;
            ctx.strokeStyle = `rgba(${EMBER},${0.7 * f * f})`;
            ctx.lineWidth = 1 + f;
            ctx.beginPath();
            ctx.moveTo(Math.round(s.trail[t - 1][0]) + 0.5, Math.round(s.trail[t - 1][1]) + 0.5);
            ctx.lineTo(Math.round(s.trail[t][0]) + 0.5, Math.round(s.trail[t][1]) + 0.5);
            ctx.stroke();
          }
          ctx.fillStyle = `rgba(${EMBER},0.9)`;
          ctx.beginPath();
          ctx.arc(x + 0.5, y + 0.5, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = `rgba(${EMBER},0.12)`;
          ctx.beginPath();
          ctx.arc(x + 0.5, y + 0.5, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Ripples: expanding rings from clicks.
      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i];
        const p = (now - r.t0) / 1500;
        if (p >= 1) {
          ripples.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(${EMBER},${0.35 * (1 - p)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, 20 + p * 620, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Dots at cell centres: travelling pulse, cursor lean + glow, ripple lift.
      const t = reduced ? 0 : now / 1000;
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          let x = gx - CELL + i * CELL + CELL / 2;
          let y = gy - CELL + j * CELL + CELL / 2;
          const wave = ambient ? 0.5 + 0.5 * Math.sin(t * 1.1 - (x + y) * 0.006) : 0.65;
          let heat = 0;
          if (pres > 0.01) {
            const dx = x - ptr.x;
            const dy = y - ptr.y;
            const d = Math.hypot(dx, dy) || 1;
            const near = Math.max(0, 1 - d / REACH);
            heat = near * near * pres;
            x += (dx / d) * 16 * heat;
            y += (dy / d) * 16 * heat;
          }
          for (const r of ripples) {
            const p = (now - r.t0) / 1500;
            const d = Math.hypot(x - r.x, y - r.y);
            const band = Math.max(0, 1 - Math.abs(d - (20 + p * 620)) / 70);
            heat = Math.max(heat, band * (1 - p));
          }
          const a = 0.08 + 0.14 * wave * wave;
          const rad = 1.1 + 0.6 * wave + 1.9 * heat;
          ctx.fillStyle = `rgba(${INK},${a * (1 - heat)})`;
          ctx.beginPath();
          ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fill();
          if (heat > 0.02) {
            ctx.fillStyle = `rgba(${EMBER},${Math.min(1, 0.15 + heat)})`;
            ctx.beginPath();
            ctx.arc(x, y, rad, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      overlay?.current?.(ctx, w, h);
    };

    // Without ambient motion, stop once the spotlight has settled.
    const settled = () =>
      !ambient &&
      ripples.length === 0 &&
      Math.abs(ptr.presence - ptr.want) < 0.002 &&
      (ptr.want === 0 || Math.abs(ptr.x - ptr.tx) + Math.abs(ptr.y - ptr.ty) < 0.3);
    const loop = (now: number) => {
      raf = 0;
      if (!visible || !onScreen) return;
      frame(now);
      if (!reduced && !settled()) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (!raf && visible && onScreen) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    };

    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      if (visible) start();
    };
    // Pointer in section coordinates; outside the section (or the
    // `hoverWithin` element) counts as away.
    const local = (cx: number, cy: number) => {
      const rect = el.getBoundingClientRect();
      const zone = (hoverWithin && document.getElementById(hoverWithin)?.getBoundingClientRect()) || rect;
      const inside = cx >= zone.left && cy >= zone.top && cx <= zone.right && cy <= zone.bottom;
      return { x: cx - rect.left, y: cy - rect.top, inside };
    };
    let lastClient: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === "touch" && !finePointer) return;
      lastClient = { x: e.clientX, y: e.clientY };
      const p = local(e.clientX, e.clientY);
      start();
      if (!p.inside) {
        ptr.want = 0;
        return;
      }
      ptr.tx = p.x;
      ptr.ty = p.y;
      if (ptr.want === 0) {
        // Arriving: jump the spotlight there instead of sweeping across.
        ptr.x = p.x;
        ptr.y = p.y;
      }
      ptr.want = 1;
    };
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) {
        ptr.want = 0;
        start();
      }
    };
    // Scrolling moves the zone under a still pointer.
    const onScroll = () => {
      if (!hoverWithin || !lastClient || ptr.want === 0) return;
      if (!local(lastClient.x, lastClient.y).inside) {
        ptr.want = 0;
        start();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!ambient || reduced || !onScreen) return;
      const p = local(e.clientX, e.clientY);
      if (!p.inside) return;
      ripples.push({ x: p.x, y: p.y, t0: performance.now() });
      if (ripples.length > 4) ripples.shift();
    };

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      start();
    });
    io.observe(el);
    const ro = new ResizeObserver(() => {
      resize();
      if (reduced || !ambient) requestAnimationFrame(frame);
    });
    ro.observe(el);

    resize();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    if (!reduced) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerdown", onDown, { passive: true });
      window.addEventListener("scroll", onScroll, { passive: true });
      document.addEventListener("mouseout", onLeave);
    }
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [ambient, hoverWithin, solid, overlay]);

  return (
    <div
      ref={wrap}
      className={`live-grid${solid ? " live-grid-solid" : ""}${className ? ` ${className}` : ""}`}
      aria-hidden
    >
      <canvas ref={ref} />
    </div>
  );
}
