"use client";

import * as React from "react";
import { cx } from "./glass";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "inverted";
  size?: "sm" | "md" | "lg";
};

/**
 * Button with a pointer-origin ripple and a spring-back press.
 * Motion: 180ms press (ease-out), 420ms ripple; honours prefers-reduced-motion
 * via the .btn-ripple rules in globals.css.
 */
export function Button({
  className,
  variant = "primary",
  size = "md",
  onPointerDown,
  children,
  ...props
}: ButtonProps) {
  const ref = React.useRef<HTMLButtonElement>(null);

  const ripple = (e: React.PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(e);
    const el = ref.current;
    if (!el || props.disabled || e.button !== 0) return;
    const rect = el.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height) * 2;
    const span = document.createElement("span");
    span.className = "btn-ripple";
    span.style.width = span.style.height = `${d}px`;
    span.style.left = `${e.clientX - rect.left - d / 2}px`;
    span.style.top = `${e.clientY - rect.top - d / 2}px`;
    el.appendChild(span);
    span.addEventListener("animationend", () => span.remove(), { once: true });
  };

  const base =
    "btn relative isolate inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl font-medium cursor-pointer select-none disabled:cursor-not-allowed disabled:opacity-40";
  const sizes = {
    sm: "h-9 px-4 text-[13px]",
    md: "h-11 px-5 text-sm",
    lg: "h-12 px-6 text-[15px]",
  } as const;
  const variants = {
    primary: "btn-primary bg-accent text-accent-foreground",
    ghost: "btn-ghost bg-transparent text-foreground",
    outline: "btn-outline bg-white/60 text-foreground border border-line-strong",
    inverted: "btn-inverted bg-white text-black",
  } as const;

  return (
    <button
      ref={ref}
      onPointerDown={ripple}
      className={cx(base, sizes[size], variants[variant], className)}
      {...props}
    >
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}
