"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, LogOut, MessageSquare, Package, RotateCcw, Trash2, Wallet, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Button, Pill } from "@/components/ui/glass";
import { AppContext, type AppState } from "./state";
import { BalanceCard } from "./BalanceCard";
import { FundsCard } from "./FundsCard";
import { Chat, type ChatHandle } from "./Chat";
import { Activity } from "./Activity";
import { SignIn } from "./SignIn";
import { InstallApp } from "./InstallApp";

/** Phone layout: one panel at a time, switched from the bottom tab bar. Desktop shows all three. */
type Tab = "chat" | "wallet" | "orders";

export function Dashboard() {
  const [state, setState] = useState<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
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
      // Approve and other actions talk to the agent: bring the chat into view on phones.
      say: (text: string) => {
        setTab("chat");
        chatRef.current?.send(text);
      },
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
  const needsApproval = state?.orders.filter((o) => o.status === "awaiting_confirmation").length ?? 0;
  const depositPending = (state?.deposits ?? []).some((d) => d.status === "PENDING");

  return (
    <AppContext.Provider value={store}>
      <div className="flex h-dvh flex-col px-3 pt-3 sm:px-4 lg:h-auto lg:min-h-dvh lg:pb-3">
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
          <div className="flex items-center gap-1 sm:gap-2">
            <InstallApp />
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
          <div className="flex flex-1 flex-col overflow-y-auto pb-[env(safe-area-inset-bottom)]">
            <SignIn onDone={() => void refresh()} />
          </div>
        ) : (
          <>
            <main className="mx-auto mt-3 flex min-h-0 w-full max-w-[1400px] flex-1 flex-col lg:grid lg:grid-cols-[320px_minmax(0,1fr)_300px] lg:gap-3">
              <aside
                className={`${tab === "wallet" ? "flex" : "hidden"} scroll-thin min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-3 lg:order-1 lg:flex lg:flex-none lg:overflow-visible lg:pb-0`}
              >
                <BalanceCard />
                <FundsCard />
              </aside>
              <section className={`${tab === "chat" ? "flex" : "hidden"} min-h-0 flex-1 flex-col lg:order-2 lg:flex`}>
                <Chat ref={chatRef} />
              </section>
              <aside className={`${tab === "orders" ? "block" : "hidden"} scroll-thin min-h-0 flex-1 overflow-y-auto pb-3 lg:order-3 lg:block lg:flex-none lg:overflow-visible lg:pb-0`}>
                <Activity />
              </aside>
            </main>

            <nav
              aria-label="App sections"
              className="glass glass-strong mx-auto mb-[max(0.75rem,env(safe-area-inset-bottom))] mt-2 grid h-[60px] w-full shrink-0 grid-cols-3 rounded-2xl p-1.5 lg:hidden"
            >
              <TabButton icon={MessageSquare} label="Chat" active={tab === "chat"} onClick={() => setTab("chat")} />
              <TabButton icon={Wallet} label="Wallet" active={tab === "wallet"} onClick={() => setTab("wallet")} dot={depositPending} />
              <TabButton icon={Package} label="Orders" active={tab === "orders"} onClick={() => setTab("orders")} badge={needsApproval} />
            </nav>
          </>
        )}
      </div>
    </AppContext.Provider>
  );
}

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
  badge = 0,
  dot = false,
}: {
  icon: LucideIcon;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`relative flex cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition-colors duration-200 ${
        active ? "bg-black text-white shadow-[0_6px_16px_-8px_rgba(0,0,0,0.6)]" : "text-muted active:bg-black/[0.05]"
      }`}
    >
      <span className="relative">
        <Icon size={18} strokeWidth={active ? 2.2 : 1.9} />
        {badge > 0 && (
          <span className="tabular absolute -right-2.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-ember px-1 text-[9.5px] font-semibold text-white">
            {badge}
          </span>
        )}
        {dot && badge === 0 && <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-ember ring-2 ring-white" />}
      </span>
      {label}
    </button>
  );
}
