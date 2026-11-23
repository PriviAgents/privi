import * as React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function GlassCard({
  className,
  strong,
  dark,
  ...props
}: DivProps & { strong?: boolean; dark?: boolean }) {
  return (
    <div
      className={cx(
        "rounded-[var(--radius-glass)]",
        dark ? "glass-dark" : "glass",
        strong && !dark && "glass-strong",
        className,
      )}
      {...props}
    />
  );
}

export { Button } from "./button";

export function Pill({
  className,
  tone = "neutral",
  ...props
}: DivProps & { tone?: "neutral" | "dark" | "success" | "danger" }) {
  const tones = {
    neutral: "bg-black/[0.05] text-foreground",
    dark: "bg-accent text-accent-foreground",
    success: "bg-emerald-50 text-success border border-emerald-200/60",
    danger: "bg-red-50 text-danger border border-red-200/60",
  } as const;
  return (
    <div
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

export function Kicker({ className, ...props }: DivProps) {
  return (
    <div
      className={cx(
        "text-[11px] font-medium uppercase tracking-[0.14em] text-subtle",
        className,
      )}
      {...props}
    />
  );
}

export function Divider({ className, ...props }: DivProps) {
  return <div className={cx("h-px w-full bg-line", className)} {...props} />;
}

export { cx };
