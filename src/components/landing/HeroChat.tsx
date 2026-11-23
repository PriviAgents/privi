"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowUp, ArrowUpRight, LayoutGrid } from "lucide-react";
import { DRAFT_KEY } from "@/lib/client/draft";
import { HeroRing } from "./HeroRing";

const SUGGESTIONS = [
  "Flight to Lisbon next Friday",
  "AirPods Pro from Amazon",
  "$50 Uber Eats gift card",
];

/**
 * First screen: the animated grid, the Privacy Ring centrepiece, and a teaser
 * chat box with an ember arc circling it. Submitting hands the request to
 * /app (prefilled, never auto-sent).
 */
export function HeroChat() {
  const router = useRouter();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = (value = text) => {
    const q = value.trim();
    if (!q) {
      inputRef.current?.focus();
      return;
    }
    try {
      sessionStorage.setItem(DRAFT_KEY, q);
    } catch {}
    router.push(`/app?q=${encodeURIComponent(q)}`);
  };

  return (
    <section
      id="hero"
      className="relative mx-auto flex min-h-[calc(100svh-4.5rem)] w-full max-w-6xl flex-col items-center px-4 pb-10 sm:pb-14"
    >
      <h1 className="sr-only">Privi: spend from a private balance on Solana, with an agent that buys for you</h1>

      {/* Centrepiece */}
      <div className="rise relative min-h-[300px] w-full flex-1" style={{ animationDelay: "80ms" }}>
        <HeroRing
          className="absolute inset-0"
          onPick={(t) => {
            setText(t);
            inputRef.current?.focus();
          }}
        />
      </div>

      {/* Teaser chat */}
      <div className="rise relative z-10 w-full max-w-[44rem]" style={{ animationDelay: "200ms" }}>
        <form
          className="hero-chat glow-ring glass glass-strong rounded-[22px] p-3 sm:p-4"
          style={{ ["--glow-radius" as string]: "22px" }}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="hero-ask" className="sr-only">
            Ask Privi for something
          </label>
          <textarea
            id="hero-ask"
            ref={inputRef}
            rows={1}
            value={text}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Ask for anything, privately."
            className="block min-h-[44px] w-full resize-none bg-transparent px-2 py-2 text-[17px] leading-[1.45] outline-none placeholder:text-subtle focus-visible:outline-none sm:text-[18px]"
          />
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 rounded-xl px-2.5 text-[13.5px] text-muted">
              <LayoutGrid size={14} />
              Agent
            </span>
            <span className="ml-auto hidden h-9 items-center rounded-xl border border-line bg-white/70 px-3 text-[12.5px] text-muted sm:inline-flex">
              Privacy Ring · Solana
            </span>
            <button
              type="submit"
              aria-label="Ask Privi"
              className="send-btn ml-auto flex size-10 items-center justify-center rounded-xl bg-foreground text-white sm:ml-0"
            >
              <ArrowUp size={17} />
            </button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setText(s);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-line bg-white/70 px-3.5 py-1.5 text-[13px] text-muted backdrop-blur transition-colors hover:border-line-strong hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>

        <Link
          href="/security-audit"
          className="audit-badge group mx-auto mt-6 flex w-fit items-center gap-2.5 text-[13.5px] text-foreground/80 transition-colors hover:text-foreground"
        >
          <Image src="/brand/zauth.png" alt="" width={22} height={22} aria-hidden className="brightness-0 transition-transform duration-300 group-hover:scale-110" />
          <span>
            Audited by <span className="font-semibold text-foreground">zauth</span>
          </span>
          <span className="h-3.5 w-px bg-line-strong" aria-hidden />
          <span className="inline-flex items-center gap-0.5 font-medium text-ember">
            Read the report
            <ArrowUpRight size={14} className="transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" />
          </span>
        </Link>
      </div>
    </section>
  );
}
