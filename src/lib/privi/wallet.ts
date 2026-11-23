import "server-only";
import type { Asset, SessionState } from "./types";
import { pushActivity, touch } from "./store";

/**
 * Per-user ledger over the pooled Privacy Ring balance. Every credit and
 * debit here is mirrored by real ring movements (deposit sweep, merchant
 * payment, withdrawal) when Rings are configured.
 */

export function balanceOf(s: SessionState, asset: Asset) {
  let b = s.wallet.balances.find((x) => x.asset === asset);
  if (!b) {
    b = { asset, amount: 0 };
    s.wallet.balances.push(b);
  }
  return b;
}

export function usdValue(s: SessionState, asset: Asset, amount: number) {
  return amount * s.wallet.prices[asset];
}

export function totalUsd(s: SessionState) {
  return s.wallet.balances.reduce((acc, b) => acc + b.amount * s.wallet.prices[b.asset], 0);
}

const DP: Record<Asset, number> = { SOL: 9, USDC: 6 };
const roundTo = (asset: Asset, n: number) => Math.round(n * 10 ** DP[asset]) / 10 ** DP[asset];

/** Debit an asset or throw a user-facing error. */
export function debit(s: SessionState, asset: Asset, amount: number) {
  const b = balanceOf(s, asset);
  if (amount <= 0) throw new Error("Amount must be positive.");
  if (b.amount + 1e-9 < amount) {
    throw new Error(`Insufficient ${asset}: have ${b.amount.toFixed(asset === "SOL" ? 4 : 2)}, need ${amount.toFixed(asset === "SOL" ? 4 : 2)}.`);
  }
  b.amount = roundTo(asset, b.amount - amount);
  touch(s);
}

export function credit(s: SessionState, asset: Asset, amount: number) {
  const b = balanceOf(s, asset);
  b.amount = roundTo(asset, b.amount + amount);
  touch(s);
}

/**
 * Choose how to pay a USD price: USDC when the balance covers it, otherwise
 * SOL at the live price. Returns undefined when neither covers it.
 */
export function chooseFunding(s: SessionState, priceUsd: number): { asset: Asset; amount: number } | undefined {
  const usdc = balanceOf(s, "USDC").amount;
  if (usdc + 1e-9 >= priceUsd) return { asset: "USDC", amount: roundTo("USDC", priceUsd) };
  const solNeeded = roundTo("SOL", priceUsd / s.wallet.prices.SOL);
  if (balanceOf(s, "SOL").amount + 1e-9 >= solNeeded) return { asset: "SOL", amount: solNeeded };
  return undefined;
}

/** Demo helper (no Rings configured): credit a balance directly. */
export function demoFund(s: SessionState, asset: Asset, amount: number) {
  credit(s, asset, amount);
  pushActivity(s, { kind: "deposit", summary: `Demo deposit · ${asset}`, amount: `+${amount} ${asset}` });
}
