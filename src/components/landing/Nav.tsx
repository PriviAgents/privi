"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { siX } from "simple-icons";
import { Button } from "@/components/ui/glass";
import { Logo } from "@/components/ui/logo";

/**
 * Sticky glass nav. Full width over the hero; once the page has scrolled past
 * the bar's original position it tightens (narrower, shorter) and stays put.
 */
export function Nav() {
  const [tight, setTight] = useState(false);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      // 4.5rem ≈ the bar's own height plus top padding: it has fully "left".
      raf = requestAnimationFrame(() => setTight(window.scrollY > 72));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 px-4 pt-4">
      <div
        data-tight={tight || undefined}
        className="nav-shell glass mx-auto flex items-center justify-between rounded-2xl md:grid md:grid-cols-[1fr_auto_1fr]"
      >
        <Logo className="justify-self-start" />
        <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
          <Link href="/#flow" className="transition-colors hover:text-foreground">How it works</Link>
          <Link href="/#rails" className="transition-colors hover:text-foreground">Where</Link>
          <Link href="/#privacy" className="transition-colors hover:text-foreground">Privacy</Link>
          <Link href="/docs" className="transition-colors hover:text-foreground">Docs</Link>
          <Link href="/tokenomics" className="transition-colors hover:text-foreground">Tokenomics</Link>
        </nav>
        <div className="flex items-center gap-1.5 justify-self-end">
          <a
            href="https://x.com/priviagents"
            target="_blank"
            rel="noreferrer"
            aria-label="Privi on X (@priviagents)"
            className="flex size-9 items-center justify-center rounded-xl text-foreground/70 transition-colors hover:bg-black/[0.05] hover:text-foreground"
          >
            <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden>
              <path d={siX.path} />
            </svg>
          </a>
          <Link href="/app">
            <Button size="sm">
              Open app <ArrowRight size={14} />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
