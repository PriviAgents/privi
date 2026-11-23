import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { kv } from "./kv";

/**
 * Traffic and cost guards for the agent.
 *
 * - Concurrency: at most PRIVI_MAX_CONCURRENT_CHATS replies stream at once,
 *   across all instances (Redis slots that expire if a function dies).
 * - Spend: model + web search cost is metered from real token usage per
 *   account per UTC day, and across the whole app per day. Over a cap, new
 *   turns are refused with a friendly message; a turn in flight always finishes.
 */

const env = (k: string, d: number) => {
  const v = Number(process.env[k]);
  return Number.isFinite(v) && v > 0 ? v : d;
};
export const MAX_CONCURRENT_CHATS = env("PRIVI_MAX_CONCURRENT_CHATS", 40);
const USER_DAILY_USD = env("PRIVI_AI_USER_DAILY_USD", 2);
const GLOBAL_DAILY_USD = env("PRIVI_AI_GLOBAL_DAILY_USD", 200);

// Claude Opus 5.5 list prices, in micro-dollars per token; web search per request.
const MICRO = { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, webSearch: 10_000 };

const day = () => new Date().toISOString().slice(0, 10);
const kUser = (sid: string) => `ai:spend:u:${sid}:${day()}`;
const kAll = () => `ai:spend:all:${day()}`;
const DAY_TTL = 60 * 60 * 26;

export function usageMicros(u: Anthropic.Beta.BetaUsage): number {
  const searches = (u.server_tool_use as { web_search_requests?: number } | null | undefined)?.web_search_requests ?? 0;
  return (
    (u.input_tokens ?? 0) * MICRO.input +
    (u.output_tokens ?? 0) * MICRO.output +
    (u.cache_read_input_tokens ?? 0) * MICRO.cacheRead +
    (u.cache_creation_input_tokens ?? 0) * MICRO.cacheWrite +
    searches * MICRO.webSearch
  );
}

export async function recordSpend(sessionId: string, micros: number): Promise<void> {
  if (micros <= 0) return;
  await Promise.all([kv.incrBy(kUser(sessionId), micros, DAY_TTL), kv.incrBy(kAll(), micros, DAY_TTL)]).catch(() => {});
}

/** Null when a new turn may start, else a message for the user. */
export async function spendGate(sessionId: string): Promise<string | null> {
  try {
    const [u, a] = await Promise.all([kv.get<number>(kUser(sessionId)), kv.get<number>(kAll())]);
    if ((a ?? 0) >= GLOBAL_DAILY_USD * 1e6) return "Privi is at capacity for today. Please try again tomorrow.";
    if ((u ?? 0) >= USER_DAILY_USD * 1e6) return "You've reached today's assistant limit. It resets at midnight UTC.";
    return null;
  } catch {
    return null; // fail open: a Redis blip shouldn't take the agent down
  }
}

const SLOTS = "chat:slots";

/** Reserve a streaming slot. Returns a release function, or null when full. */
export async function acquireChatSlot(): Promise<(() => Promise<void>) | null> {
  const member = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let ok = true;
  try {
    ok = await kv.slotAcquire(SLOTS, member, MAX_CONCURRENT_CHATS, 130);
  } catch {
    ok = true; // fail open
  }
  if (!ok) return null;
  return async () => {
    await kv.slotRelease(SLOTS, member).catch(() => {});
  };
}
