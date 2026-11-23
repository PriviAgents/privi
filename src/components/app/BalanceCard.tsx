"use client";

import { Lock } from "lucide-react";
import { Divider, GlassCard, Kicker } from "@/components/ui/glass";
import { num, usd } from "@/lib/client/format";
import { useApp } from "./state";

export function BalanceCard() {
  const { state } = useApp();
  if (!state) return <GlassCard className="h-[220px] animate-pulse p-5" />;

  const { wallet } = state;
  const sol = wallet.balances.find((b) => b.asset === "SOL")?.amount ?? 0;
  const usdc = wallet.balances.find((b) => b.asset === "USDC")?.amount ?? 0;
  const prices = state.live?.prices ?? wallet.prices;
  const total = sol * prices.SOL + usdc * prices.USDC;

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between">
        <Kicker>Private balance</Kicker>
        <span className="inline-flex items-center gap-1.5 text-[11.5px] text-subtle">
          <Lock size={11} /> Privacy Ring
        </span>
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span className="tabular text-[38px] font-semibold leading-none tracking-tight">{usd(total)}</span>
      </div>
      <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-muted">
        <span className={`size-1.5 rounded-full ${state.live && !state.live.stale ? "bg-emerald-500" : "bg-black/20"}`} aria-hidden />
        <span>SOL price</span>
        <span className="tabular font-medium text-foreground">{usd(prices.SOL)}</span>
      </div>

      <Divider className="my-4" />

      <div className="space-y-1.5 text-[14px]">
        <Row label="SOL" value={num(sol, 4)} sub={usd(sol * prices.SOL)} />
        <Row label="USDC" value={num(usdc, 2)} sub={usd(usdc)} />
      </div>

      <p className="mt-4 text-[11.5px] leading-[1.5] text-subtle">
        Amounts are encrypted on-chain in a Helius Privacy Ring{state.network ? ` (${state.network})` : ""}.
        {state.demo ? " Demo balance — no real funds." : ""}
      </p>
    </GlassCard>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-muted">{label}</span>
      <span className="tabular">
        <span className="font-medium">{value}</span>
        <span className="ml-2 text-[12px] text-subtle">{sub}</span>
      </span>
    </div>
  );
}
