"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, RotateCcw, Trash2 } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button, Pill } from "@/components/ui/glass";
import { AppContext, type AppState } from "./state";
import { BalanceCard } from "./BalanceCard";
import { FundsCard } from "./FundsCard";
import { Chat, type ChatHandle } from "./Chat";
import { Activity } from "./Activity";
import { SignIn } from "./SignIn";

export function Dashboard() {
  const [state, setState] = useState<AppState | null>(null);
  const chatRef = useRef<ChatHandle>(null);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) setState(await r.json());
  }, []);

  useEffect(() => {
    // Initial load; setState happens in the promise callback, not the effect body.
    let alive = true;
    fetch("/api/state", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: AppState | null) => {
        if (alive && j) setState({ ...j, loadedAt: Date.now() });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Live spot prices every 10s, independent of anything else that updates the wallet.
  const ready = state !== null;
  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/prices", { cache: "no-store" });
        if (!r.ok || !alive) return;
        const j = await r.json();
        setState((s) => (s ? { ...s, live: { prices: j.prices, updatedAt: j.updatedAt, stale: j.stale } } : s));
      } catch {
        /* keep the last price */
      }
    };
    const t = setTimeout(() => void tick(), 0);
    const iv = setInterval(() => void tick(), 10_000);
    return () => {
      alive = false;
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [ready]);

  // Poll pending deposits every 6s; the server credits the balance once confirmed on-chain.
  const activeIds = (state?.deposits ?? [])
    .filter((d) => d.status === "PENDING")
    .map((p) => p.id)
    .join(",");
  useEffect(() => {
    if (!activeIds) return;
    let alive = true;
    const tick = async () => {
      for (const id of activeIds.split(",")) {
        try {
          const r = await fetch("/api/funds", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "status", depositId: id }),
          });
          if (!alive) return;
          if (r.ok) {
            const j = await r.json();
            setState((s) => (s ? { ...s, wallet: j.wallet, activity: j.activity, deposits: j.deposits, withdrawals: j.withdrawals } : s));
          }
        } catch {
          /* transient */
        }
      }
    };
    const iv = setInterval(() => void tick(), 6000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [activeIds]);

  const store = useMemo(
    () => ({
      state,
      refresh,
      apply: (p: Partial<AppState>) => setState((s) => (s ? { ...s, ...p } : s)),
      say: (text: string) => chatRef.current?.send(text),
    }),
    [state, refresh],
  );

  const reset = async () => {
    const r = await fetch("/api/state", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reset" }),
    });
    if (r.ok) {
      setState(await r.json());
      chatRef.current?.clear();
    }
  };

  const signOut = async () => {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    chatRef.current?.clear();
    await refresh();
  };

  const deleteChat = async () => {
    if (!window.confirm("Delete your chat history? This permanently erases your conversations with Privi. Your balance and orders aren't affected.")) return;
    const r = await fetch("/api/chat", { method: "DELETE" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      window.alert(j.error ?? "Couldn't delete chat history. Try again.");
      return;
    }
    chatRef.current?.clear();
  };

  const locked = state ? !state.signedIn : false;

  return (
    <AppContext.Provider value={store}>
      <div className="flex min-h-dvh flex-col px-3 pb-3 pt-3 sm:px-4">
        <header className="glass mx-auto flex h-13 w-full max-w-[1400px] items-center justify-between rounded-2xl px-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-full p-1.5 text-muted hover:bg-black/[0.05] hover:text-foreground" aria-label="Back to home">
              <ArrowLeft size={16} />
            </Link>
            <Logo href="/app" />
            {state?.demo && (
              <span className="hidden sm:block">
                <Pill>Demo · simulated rails</Pill>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {state && !state.agentReady && (
              <span className="hidden md:block">
                <Pill tone="danger">Add ANTHROPIC_API_KEY to enable the agent</Pill>
              </span>
            )}
            {state?.demo && (
              <Button size="sm" variant="ghost" onClick={reset} aria-label="Reset demo">
                <RotateCcw size={14} /> <span className="hidden sm:inline">Reset</span>
              </Button>
            )}
            {state && !state.demo && state.signedIn && (
              <Button size="sm" variant="ghost" onClick={deleteChat} aria-label="Delete chat history" title="Delete chat history">
                <Trash2 size={14} /> <span className="hidden sm:inline">Delete chat</span>
              </Button>
            )}
            {state && !state.demo && state.signedIn && (
              <Button size="sm" variant="ghost" onClick={signOut} aria-label="Sign out">
                <LogOut size={14} /> <span className="hidden sm:inline">Sign out</span>
              </Button>
            )}
          </div>
        </header>

        {locked ? (
          <SignIn onDone={() => void refresh()} />
        ) : (
        <main className="mx-auto mt-3 grid w-full max-w-[1400px] flex-1 gap-3 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
          <aside className="order-2 flex flex-col gap-3 lg:order-1">
            <BalanceCard />
            <FundsCard />
          </aside>
          <section className="order-1 min-h-[70dvh] lg:order-2 lg:min-h-0">
            <Chat ref={chatRef} />
          </section>
          <aside className="order-3">
            <Activity />
          </aside>
        </main>
        )}
      </div>
    </AppContext.Provider>
  );
}
