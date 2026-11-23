"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Loader2, Wallet as WalletIcon } from "lucide-react";
import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/base";
import type { Deposit } from "@/lib/privi/types";

const CONNECT = "standard:connect";
const SEND = "solana:signAndSendTransaction";

type ConnectFeature = { connect: () => Promise<{ accounts: readonly WalletAccount[] }> };
const SIGN = "solana:signTransaction";
type SignFeature = {
  signTransaction: (input: { account: WalletAccount; transaction: Uint8Array; chain: string }) => Promise<readonly { signedTransaction: Uint8Array }[]>;
};
type SendFeature = {
  signAndSendTransaction: (input: { account: WalletAccount; transaction: Uint8Array; chain: string }) => Promise<readonly { signature: Uint8Array }[]>;
};

function solanaWallets(): Wallet[] {
  return getWallets()
    .get()
    .filter((w) => CONNECT in w.features && SEND in w.features && w.chains.some((c) => c.startsWith("solana:")));
}

/**
 * Pay a deposit from a browser wallet (Phantom, Solflare, Backpack… via Wallet
 * Standard). The server builds the exact transfer with the deposit's reference;
 * the wallet signs and sends it. On phones without an extension, falls back to
 * the Solana Pay link, which wallet apps handle.
 */
export function WalletPay({ d, network }: { d: Deposit; network: string | null }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const api = getWallets();
    const update = () => setWallets(solanaWallets());
    const t = setTimeout(update, 0);
    const offs = [api.on("register", update), api.on("unregister", update)];
    return () => {
      clearTimeout(t);
      offs.forEach((off) => off());
    };
  }, []);

  const pay = async (w: Wallet) => {
    setBusy(w.name);
    setError(null);
    try {
      const { accounts } = await (w.features[CONNECT] as ConnectFeature).connect();
      const account = accounts.find((a) => a.chains.some((c) => c.startsWith("solana:"))) ?? accounts[0];
      if (!account) throw new Error("No Solana account in that wallet.");
      const r = await fetch("/api/funds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "deposit-tx", depositId: d.id, payer: account.address }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Couldn't prepare the payment.");
      const transaction = Uint8Array.from(atob(j.transaction), (c) => c.charCodeAt(0));
      const chain = `solana:${network ?? "mainnet"}`;
      if (SIGN in w.features) {
        // Sign only; Privi submits through its own RPC node (Phantom's recommended flow).
        const [out] = await (w.features[SIGN] as SignFeature).signTransaction({ account, transaction, chain });
        let bin = "";
        out.signedTransaction.forEach((b) => (bin += String.fromCharCode(b)));
        const r2 = await fetch("/api/funds", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "deposit-submit", depositId: d.id, transaction: btoa(bin) }),
        });
        const j2 = await r2.json();
        if (!r2.ok) throw new Error(j2.error ?? "Couldn't send the payment.");
      } else {
        await (w.features[SEND] as SendFeature).signAndSendTransaction({ account, transaction, chain });
      }
      setSent(true);
    } catch (e) {
      const msg = (e as Error).message ?? "";
      setError(/reject|cancel|denied|closed/i.test(msg) ? "Payment cancelled in the wallet." : msg || "Wallet payment failed.");
    } finally {
      setBusy(null);
    }
  };

  if (sent) return <p className="text-[12px] text-muted">Sent. Confirming on Solana…</p>;

  return (
    <div className="space-y-1.5">
      {wallets.length > 0 ? (
        <>
          <div className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">Pay with</div>
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            {wallets.slice(0, 3).map((w, i) => (
              <button
                key={w.name}
                disabled={busy !== null}
                onClick={() => pay(w)}
                className={`group flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors hover:bg-black/[0.03] disabled:cursor-wait disabled:opacity-60 ${i > 0 ? "border-t border-line" : ""}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {w.icon ? <img src={w.icon} alt="" className="size-5 rounded-md" /> : <WalletIcon size={16} className="text-foreground/70" />}
                <span className="flex-1 font-medium">{w.name}</span>
                {busy === w.name ? <Loader2 size={13} className="animate-spin text-subtle" /> : <ChevronRight size={14} className="text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />}
              </button>
            ))}
          </div>
        </>
      ) : (
        <a href={d.paymentUri} className="flex items-center justify-between whitespace-nowrap rounded-xl border border-line bg-white px-3 py-2 text-[12.5px] font-medium hover:bg-black/[0.03]">
          <span className="inline-flex items-center gap-2">
            <WalletIcon size={15} className="text-foreground/70" /> Wallet app
          </span>
          <ChevronRight size={14} className="text-subtle" />
        </a>
      )}
      {error && <p className="text-[11.5px] text-danger" role="alert">{error}</p>}
    </div>
  );
}
