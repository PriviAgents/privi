import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { randomBytes } from "node:crypto";
import type { ActivityItem, SessionState, WalletSnapshot } from "./types";
import { kv } from "./kv";

// Session state and the Anthropic transcript, keyed by an opaque session id
// carried in a cookie. Persisted through `kv` (Upstash Redis in production,
// in-memory locally). Callers load, mutate, then save.

const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days, refreshed on every save
const sKey = (id: string) => `s:${id}`;
const tKey = (id: string) => `t3:${id}`; // bump when the agent tool list changes

export const SESSION_COOKIE = "privi_session";

export function newSessionId(): string {
  return randomBytes(16).toString("hex");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(6).toString("hex")}`;
}

// Fallback prices, used only until the live feed (lib/privi/prices.ts) answers.
// Last refreshed 2026-11-21.
export const DEMO_PRICES = { USDC: 1, SOL: 108 } as const;

// Demo mode only (no Privacy Rings configured): starting balance and faucet.
export const DEMO_SEED = { SOL: 2, USDC: 250 } as const;
export const DEMO_FAUCET = { SOL: 0.5, USDC: 50 } as const;

/** True when real Privacy Rings are configured; otherwise the app runs in demo mode. */
export const liveMode = () => Boolean(process.env.HELIUS_API_KEY && process.env.PRIVI_TREASURY_SECRET);

function seedWallet(): WalletSnapshot {
  const live = liveMode();
  return {
    balances: [
      { asset: "SOL", amount: live ? 0 : DEMO_SEED.SOL },
      { asset: "USDC", amount: live ? 0 : DEMO_SEED.USDC },
    ],
    prices: { ...DEMO_PRICES },
    updatedAt: new Date().toISOString(),
  };
}

function freshSession(id: string): SessionState {
  const live = liveMode();
  return {
    id,
    wallet: seedWallet(),
    orders: [],
    deposits: [],
    withdrawals: [],
    offers: [],
    activity: [
      {
        id: newId("act"),
        at: new Date().toISOString(),
        kind: "system",
        summary: live ? "Private balance opened" : `Demo balance · ${DEMO_SEED.SOL} SOL + ${DEMO_SEED.USDC} USDC`,
      },
    ],
  };
}

/** Load a session, creating (but not saving) a fresh one if none exists. */
export async function loadSession(id: string): Promise<SessionState> {
  const s = await kv.get<SessionState>(sKey(id));
  if (!s) return freshSession(id);
  // Sessions from the Zcash era are incompatible: start them fresh.
  if (!Array.isArray(s.deposits) || s.wallet.balances.some((b) => (b.asset as string) === "ZEC")) return freshSession(id);
  s.offers ??= [];
  s.withdrawals ??= [];
  return s;
}

export async function saveSession(s: SessionState): Promise<void> {
  // Keep the stored document small: these lists only need recent entries.
  s.offers = s.offers.slice(0, 40);
  s.activity = s.activity.slice(0, 50);
  s.orders = s.orders.slice(0, 100);
  s.deposits = s.deposits.slice(0, 20);
  s.withdrawals = s.withdrawals.slice(0, 50);
  await kv.set(sKey(s.id), s, SESSION_TTL);
}

export function touch(s: SessionState) {
  s.wallet.updatedAt = new Date().toISOString();
}

export function pushActivity(
  s: SessionState,
  item: Omit<ActivityItem, "id" | "at">,
) {
  s.activity.unshift({ id: newId("act"), at: new Date().toISOString(), ...item });
  s.activity = s.activity.slice(0, 50);
}

// Upstash caps a single value at 1 MB. Rather than trimming history (which
// would invalidate preserved thinking blocks), a transcript that grows past
// this starts a fresh conversation; the UI still shows what was said.
const MAX_TRANSCRIPT_BYTES = 750_000;

export async function loadTranscript(id: string): Promise<Anthropic.Beta.BetaMessageParam[]> {
  return (await kv.get<Anthropic.Beta.BetaMessageParam[]>(tKey(id))) ?? [];
}

export async function saveTranscript(id: string, messages: Anthropic.Beta.BetaMessageParam[]): Promise<void> {
  const size = Buffer.byteLength(JSON.stringify(messages));
  if (size > MAX_TRANSCRIPT_BYTES) {
    await kv.del(tKey(id));
    return;
  }
  await kv.set(tKey(id), messages, SESSION_TTL);
}

/** Erase the stored conversation for this account (the user's "Delete chat history"). */
export async function deleteTranscript(id: string): Promise<void> {
  await kv.del(tKey(id));
}

export async function resetSession(id: string): Promise<void> {
  await Promise.all([kv.del(sKey(id)), kv.del(tKey(id))]);
}
