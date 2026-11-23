import "server-only";
import { kv } from "./kv";

/**
 * First-party monitoring, stored in Redis. No third-party tracker sees users:
 *  - an error log (browser + server), newest 500 kept;
 *  - daily counters (signups, sign-ins, chat turns, orders, deposits).
 * Read by the admin dashboard at /admin.
 */

const ERR_KEY = "telemetry:errors"; // server-side only: browsers can't write here
const CLIENT_KEY = "telemetry:client"; // unauthenticated browser reports, kept apart
const day = (offset = 0) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
const YEAR = 60 * 60 * 24 * 400;

export type StatName = "signups" | "logins" | "chats" | "orders" | "deposits" | "passkey_fail";

export async function bump(stat: StatName, by = 1): Promise<void> {
  await kv.incrBy(`stats:${stat}:${day()}`, by, YEAR).catch(() => {});
}

export async function series(stat: StatName, days: number): Promise<{ day: string; n: number }[]> {
  const keys = Array.from({ length: days }, (_, i) => day(days - 1 - i));
  const vals = await Promise.all(keys.map((d) => kv.get<number>(`stats:${stat}:${d}`).catch(() => null)));
  return keys.map((d, i) => ({ day: d, n: Number(vals[i] ?? 0) }));
}

export interface ErrorEvent {
  at: string;
  source: "client" | "server";
  where: string; // e.g. "passkey:create", "chat", "funds:withdraw"
  name?: string;
  message: string;
  path?: string;
  ua?: string;
  sid?: string; // first 6 chars of the session, to group one user's errors
}

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : undefined);

export async function recordError(e: Omit<ErrorEvent, "at">): Promise<void> {
  const ev: ErrorEvent = {
    at: new Date().toISOString(),
    source: e.source,
    where: clip(e.where, 60) ?? "unknown",
    name: clip(e.name, 80),
    message: clip(e.message, 500) ?? "",
    path: clip(e.path, 120),
    ua: clip(e.ua, 220),
    sid: clip(e.sid, 6),
  };
  await kv.listPush(ev.source === "server" ? ERR_KEY : CLIENT_KEY, ev, ev.source === "server" ? 500 : 200).catch(() => {});
  if (process.env.NODE_ENV === "production") console.error(`[privi:${ev.where}] ${ev.name ?? ""} ${ev.message}`);
}

export async function serverError(where: string, err: unknown, sid?: string): Promise<void> {
  const e = err as { name?: string; message?: string };
  await recordError({ source: "server", where, name: e?.name, message: e?.message ?? String(err), sid });
}

export async function recentErrors(n = 100): Promise<ErrorEvent[]> {
  const [server, client] = await Promise.all([
    kv.listRange<ErrorEvent>(ERR_KEY, n).catch(() => []),
    kv.listRange<ErrorEvent>(CLIENT_KEY, n).catch(() => []),
  ]);
  return [...server, ...client].sort((a, b) => b.at.localeCompare(a.at)).slice(0, n);
}
