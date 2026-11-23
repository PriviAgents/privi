"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";
import { Button, GlassCard, Kicker } from "@/components/ui/glass";
import { num } from "@/lib/client/format";
import type { Asset, Deposit } from "@/lib/privi/types";
import { useApp, type AppState } from "./state";
import { WalletPay } from "./WalletPay";

type Tab = "deposit" | "withdraw";

export function FundsCard() {
  const { state } = useApp();
  const [tab, setTab] = useState<Tab>("deposit");
  if (!state) return <GlassCard className="h-[260px] animate-pulse p-5" />;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between">
        <Kicker>Funds</Kicker>
        <div className="flex rounded-lg border border-line bg-white p-0.5 text-[12px]">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`cursor-pointer rounded-md px-2.5 py-1 capitalize transition-colors ${tab === t ? "bg-black text-white" : "text-muted hover:text-foreground"}`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === "deposit" ? <DepositPane /> : <WithdrawPane />}
    </GlassCard>
  );
}

function AssetToggle({ value, onChange }: { value: Asset; onChange: (a: Asset) => void }) {
  return (
    <div className="flex rounded-lg border border-line bg-white p-0.5 text-[12px]">
      {(["USDC", "SOL"] as const).map((a) => (
        <button
          key={a}
          onClick={() => onChange(a)}
          className={`cursor-pointer rounded-md px-2.5 py-1 transition-colors ${value === a ? "bg-black text-white" : "text-muted hover:text-foreground"}`}
        >
          {a}
        </button>
      ))}
    </div>
  );
}

async function post(body: unknown) {
  const r = await fetch("/api/funds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Request failed");
  return j;
}

function applySlice(apply: (p: Partial<AppState>) => void, j: Partial<AppState>) {
  apply({ wallet: j.wallet, activity: j.activity, deposits: j.deposits, withdrawals: j.withdrawals } as Partial<AppState>);
}

function DepositPane() {
  const { state, apply } = useApp();
  const [asset, setAsset] = useState<Asset>("USDC");
  const [amount, setAmount] = useState("50");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!state) return null;

  // The newest deposit owns the pane while pending, or until dismissed once confirmed.
  const active = state.deposits.find((d) => d.id !== dismissed && (d.status === "PENDING" || (d.status === "CONFIRMED" && new Date(d.updatedAt).getTime() > (state.loadedAt ?? Infinity))));
  if (active) return <DepositStatus d={active} onDone={() => setDismissed(active.id)} />;

  if (state.demo) {
    const fund = async (a: Asset) => {
      setBusy(true);
      setError(null);
      try {
        applySlice(apply, await post({ action: "faucet", asset: a }));
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    };
    return (
      <div className="mt-4">
        <p className="text-[12.5px] leading-[1.5] text-muted">Demo mode: add test funds to try the agent. No real money moves.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="outline" size="sm" onClick={() => fund("USDC")} disabled={busy}>+ 50 USDC</Button>
          <Button variant="outline" size="sm" onClick={() => fund("SOL")} disabled={busy}>+ 0.5 SOL</Button>
        </div>
        {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
      </div>
    );
  }

  const amt = Number(amount);
  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      applySlice(apply, await post({ action: "deposit", asset, amount: amt }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4">
      <div className="rounded-2xl border border-line bg-white/50 p-3">
        <div className="text-[11.5px] text-subtle">Amount</div>
        <div className="mt-1 flex items-center gap-2">
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            aria-label="Deposit amount"
            className="tabular w-full bg-transparent text-[22px] font-semibold tracking-tight outline-none"
          />
          <AssetToggle value={asset} onChange={setAsset} />
        </div>
      </div>
      {error && <div className="mt-2 text-[12px] text-danger">{error}</div>}
      <Button className="mt-3 w-full" onClick={create} disabled={!(amt > 0) || busy}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : null}
        Get deposit QR
      </Button>
      <p className="mt-2 text-[11.5px] leading-[1.5] text-subtle">Pay from any Solana wallet. Funds move into your Privacy Ring once confirmed.</p>
    </div>
  );
}

function DepositStatus({ d, onDone }: { d: Deposit; onDone: () => void }) {
  const { state, apply } = useApp();
  const [cancelling, setCancelling] = useState(false);
  const cancel = async () => {
    if (!window.confirm(`Cancel this deposit of ${d.amount} ${d.asset}?\n\nOnly cancel if you haven't sent it yet. A payment sent after cancelling isn't added to your balance automatically.`)) return;
    setCancelling(true);
    try {
      const r = await fetch("/api/funds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "cancel-deposit", depositId: d.id }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't cancel. Try again.");
      applySlice(apply, j);
      if (j.deposit?.status === "CONFIRMED") window.alert("This payment already arrived, so it was added to your balance instead.");
      else onDone();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setCancelling(false);
    }
  };
  const [copied, setCopied] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setLeft(Math.max(0, new Date(d.expiresAt).getTime() - Date.now()));
    const t = setTimeout(update, 0);
    const iv = setInterval(update, 1000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [d.expiresAt]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(d.recipient);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  const ms = left ?? 0;
  const dp = d.asset === "SOL" ? 4 : 2;

  if (d.status === "CONFIRMED") {
    return (
      <div className="mt-4">
        <div className="flex items-center gap-2 text-[13px]">
          <span className="flex size-5 items-center justify-center rounded-full bg-black text-white"><Check size={11} /></span>
          <span className="font-medium">Deposit confirmed</span>
        </div>
        <p className="mt-2 text-[12.5px] text-muted">
          +{num(d.received ?? d.amount, dp)} {d.asset} added to your private balance.
          {d.ring?.status === "failed" ? " Moving into the ring shortly." : ""}
        </p>
        <Button className="mt-3 w-full" variant="outline" size="sm" onClick={onDone}>New deposit</Button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex items-start gap-4">
        <div className="size-28 shrink-0 rounded-xl border border-line bg-white p-2 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: d.qrSvg }} aria-label="Solana Pay QR code" />
        <div className="min-w-0 flex-1 space-y-2 text-[13px]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted">Send</span>
            <span className="tabular font-semibold">{d.amount} {d.asset}</span>
          </div>
          <button onClick={copy} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-line bg-white/60 px-2.5 py-1.5 text-left font-mono text-[11px] text-muted hover:border-black/30 hover:text-foreground" title={d.recipient}>
            <span className="truncate">{d.recipient}</span>
            {copied ? <Check size={12} className="shrink-0" /> : <Copy size={12} className="shrink-0" />}
          </button>
          {d.status === "PENDING" && <WalletPay d={d} network={state?.network ?? null} />}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          {d.status === "PENDING" ? <><Loader2 size={12} className="animate-spin" /> Waiting for payment</> : <><X size={12} /> Expired</>}
        </span>
        <span className="tabular">{d.status === "PENDING" && left !== null ? `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}` : ""}</span>
      </div>
      <p className="mt-2 text-[11.5px] leading-[1.5] text-subtle">
        Pay with your wallet, scan the code with your phone, or send exactly {d.amount} {d.asset} to the address. The exact amount is how a manual transfer is matched to you.
      </p>
      {d.status === "PENDING" && (
        <button
          onClick={cancel}
          disabled={cancelling}
          className="mt-3 w-full cursor-pointer rounded-xl py-2 text-[12.5px] text-muted transition-colors hover:bg-black/[0.04] hover:text-foreground disabled:opacity-50"
        >
          {cancelling ? "Cancelling…" : "Cancel deposit"}
        </button>
      )}
      {d.status === "EXPIRED" && <Button className="mt-3 w-full" variant="outline" size="sm" onClick={onDone}>Start over</Button>}
    </div>
  );
}

function WithdrawPane() {
  const { state, apply } = useApp();
  const [asset, setAsset] = useState<Asset>("USDC");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!state) return null;

  if (state.demo) {
    return <p className="mt-4 text-[12.5px] leading-[1.5] text-muted">Withdrawals move real funds out of the Privacy Ring and are available once Privi is live.</p>;
  }

  const bal = state.wallet.balances.find((b) => b.asset === asset)?.amount ?? 0;
  const amt = Number(amount);
  const valid = amt > 0 && amt <= bal && to.trim().length >= 32;

  const send = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const j = await post({ action: "withdraw", asset, amount: amt, to: to.trim() });
      applySlice(apply, j);
      setAmount("");
      let w = j.withdrawal as { id: string; status: string; error?: string } | undefined;
      if (w?.status === "pending") {
        // Submitted, but Solana hasn't confirmed it yet: follow it until it settles.
        setMsg({ ok: true, text: `Submitted ${amt} ${asset}. Confirming on Solana…` });
        for (let i = 0; i < 60 && w?.status === "pending"; i++) {
          await new Promise((r) => setTimeout(r, 6_000));
          const k = await post({ action: "withdrawals" }).catch(() => null);
          if (!k) continue;
          applySlice(apply, k);
          w = (k.withdrawals as { id: string; status: string; error?: string }[]).find((x) => x.id === w!.id) ?? w;
        }
      }
      if (w?.status === "failed") setMsg({ ok: false, text: w.error ?? "The withdrawal didn't go through. Your balance was restored." });
      else if (w?.status === "pending") setMsg({ ok: true, text: `Submitted ${amt} ${asset}. Still confirming; your balance updates once it settles.` });
      else setMsg({ ok: true, text: `Sent ${amt} ${asset}.` });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      <div className="rounded-2xl border border-line bg-white/50 p-3">
        <div className="flex items-center justify-between text-[11.5px] text-subtle">
          <span>Amount</span>
          <button className="cursor-pointer hover:text-foreground" onClick={() => setAmount(String(bal))}>Max {num(bal, asset === "SOL" ? 4 : 2)}</button>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} aria-label="Withdraw amount" placeholder="0.00" className="tabular w-full bg-transparent text-[22px] font-semibold tracking-tight outline-none placeholder:text-subtle" />
          <AssetToggle value={asset} onChange={setAsset} />
        </div>
      </div>
      <input value={to} onChange={(e) => setTo(e.target.value)} aria-label="Destination Solana address" placeholder="Destination Solana address" className="h-10 w-full rounded-xl border border-line bg-white/60 px-3 font-mono text-[16px] sm:text-[11.5px] outline-none placeholder:font-sans placeholder:text-subtle focus:border-black/30" />
      <Button className="w-full" onClick={send} disabled={!valid || busy}>
        {busy ? <Loader2 size={15} className="animate-spin" /> : null}
        Withdraw
      </Button>
      {msg && <div className={`text-[12px] ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</div>}
      <p className="text-[11.5px] leading-[1.5] text-subtle">A withdrawal shows its amount and destination on-chain; the rest of your balance stays encrypted.</p>
    </div>
  );
}
