"use client";

import { useEffect, useRef, useState } from "react";
import { Copy } from "lucide-react";

/** Contract address with a copy button that flips to an animated checkmark. */
export function CopyAddress({ address, label }: { address: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      // Older browsers: select-and-copy fallback.
      const t = document.createElement("textarea");
      t.value = address;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex w-full max-w-[640px] items-center gap-3 rounded-2xl border border-line bg-white/80 py-2 pl-4 pr-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-subtle">{label}</div>
        <div className="mt-0.5 truncate font-mono text-[13px] text-foreground/90 sm:text-[13.5px]" title={address}>
          {address}
        </div>
      </div>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy contract address"}
        className={`relative flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors duration-200 ${
          copied ? "bg-ember text-white" : "bg-black text-white hover:bg-black/85"
        }`}
      >
        <Copy size={15} className={`absolute transition-all duration-200 ${copied ? "scale-50 opacity-0" : "scale-100 opacity-100"}`} />
        <svg
          viewBox="0 0 24 24"
          width={17}
          height={17}
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={`absolute transition-transform duration-200 ${copied ? "scale-100" : "scale-50"}`}
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className={copied ? "check-draw" : "opacity-0"} />
        </svg>
        <span className="sr-only" aria-live="polite">{copied ? "Copied" : ""}</span>
      </button>
    </div>
  );
}

