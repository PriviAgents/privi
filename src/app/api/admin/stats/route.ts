import { timingSafeEqual } from "node:crypto";
import { kv, rateLimit } from "@/lib/privi/kv";
import { recentErrors, series } from "@/lib/privi/telemetry";
import { ringBalances, ringsConfigured, spendBalances } from "@/lib/privi/rings";

// Admin dashboard data. Bearer PRIVI_ADMIN_TOKEN only.
export const maxDuration = 60;

function authorized(req: Request): boolean {
  const expected = process.env.PRIVI_ADMIN_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 24 || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

const settle = async <T,>(p: Promise<T>): Promise<T | { error: string }> => p.catch((e: Error) => ({ error: e.message }));

export async function GET(req: Request) {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  if (!(await rateLimit(`admin:${ip}`, 30, 60)).ok) return Response.json({ error: "slow down" }, { status: 429 });
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });

  const today = new Date().toISOString().slice(0, 10);
  const [users, sessions, signups, logins, chats, orders, deposits, passkeyFails, aiSpendMicros, errors, spend, ring] = await Promise.all([
    kv.countKeys("user:*"),
    kv.countKeys("s:*"),
    series("signups", 14),
    series("logins", 14),
    series("chats", 14),
    series("orders", 14),
    series("deposits", 14),
    series("passkey_fail", 14),
    kv.get<number>(`ai:spend:all:${today}`),
    recentErrors(100),
    ringsConfigured() ? settle(spendBalances()) : Promise.resolve(null),
    ringsConfigured() ? settle(ringBalances()) : Promise.resolve(null),
  ]);
  return Response.json(
    { at: new Date().toISOString(), users, sessions, series: { signups, logins, chats, orders, deposits, passkeyFails }, aiSpendTodayUsd: Number(aiSpendMicros ?? 0) / 1e6, errors, spend, ring },
    { headers: { "cache-control": "no-store" } },
  );
}
