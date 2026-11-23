import "server-only";
import { cookies, headers } from "next/headers";
import { loadSession, newSessionId, saveSession, SESSION_COOKIE } from "./store";
import { isOwnedBalance, signedInUser, type Account } from "./auth";
import type { SessionState } from "./types";

/**
 * Resolve this browser's session. The cookie is either a sign-in token (then
 * the session is the account's balance) or an anonymous, signed-out session.
 * A cookie naming an owned balance without a live token, or a malformed one,
 * gets a brand-new id. Nothing is written here: an anonymous session is only
 * stored once something changes it. The session is a loaded copy: call
 * `saveSession(session)` after mutating it.
 */
export async function currentSession(): Promise<{
  session: SessionState;
  setCookie?: { name: string; value: string };
  /** Best-effort client IP, for rate limiting. */
  ip: string;
  /** The cookie value: the key for passkey challenges and sign-out. */
  browserId: string;
  /** The signed-in account, if any. */
  account: Account | null;
}> {
  const [jar, h] = await Promise.all([cookies(), headers()]);
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const existing = jar.get(SESSION_COOKIE)?.value;
  if (existing && /^[a-f0-9]{32}$/.test(existing)) {
    const account = await signedInUser(existing);
    if (account) return { session: await loadSession(account.sessionId), ip, browserId: existing, account };
    if (!(await isOwnedBalance(existing))) return { session: await loadSession(existing), ip, browserId: existing, account: null };
  }
  const id = newSessionId();
  return { session: await loadSession(id), setCookie: { name: SESSION_COOKIE, value: id }, ip, browserId: id, account: null };
}

export function clearSessionCookieHeader() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function sessionCookieHeader(value: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}${secure}`;
}

export { saveSession };

/**
 * One money-changing request per account at a time. Every writer loads the
 * account inside the lock, so a chat turn can't overwrite a deposit credited
 * by a parallel request (or vice versa). Returns a release function, or null
 * if the account is busy after `waitMs`.
 */
export async function lockSession(sessionId: string, ttlSec = 130, waitMs = 0): Promise<(() => Promise<void>) | null> {
  const { kv } = await import("./kv");
  const key = `lock:sess:${sessionId}`;
  const token = `${Date.now()}-${Math.random()}`;
  const deadline = Date.now() + waitMs;
  while (!(await kv.setNx(key, token, ttlSec))) {
    if (Date.now() >= deadline) return null;
    await new Promise((r) => setTimeout(r, 300));
  }
  return async () => {
    if ((await kv.get<string>(key)) === token) await kv.del(key);
  };
}

/**
 * Comprehensively sanctioned jurisdictions (OFAC), plus Russian-occupied
 * Ukrainian regions, refused for anything that moves money. Uses Vercel's
 * geo headers; a VPN can get past this, so it is a floor, not a guarantee.
 */
const BLOCKED_COUNTRIES = new Set(["CU", "IR", "KP", "SY"]);
const BLOCKED_UA_REGIONS = new Set(["43", "40", "14", "09", "23", "65"]); // Crimea, Sevastopol, Donetsk, Luhansk, Zaporizhzhia, Kherson
export async function regionBlocked(): Promise<boolean> {
  const h = await headers();
  const country = (h.get("x-vercel-ip-country") ?? "").toUpperCase();
  const region = h.get("x-vercel-ip-country-region") ?? "";
  return BLOCKED_COUNTRIES.has(country) || (country === "UA" && BLOCKED_UA_REGIONS.has(region));
}

/**
 * In live mode, money-moving routes need a passkey-signed-in session. Returns a
 * 401 response to send, or null when the caller may proceed.
 */
export async function requireSignedIn(account: Account | null, headers: Record<string, string>): Promise<Response | null> {
  const { liveMode } = await import("./store");
  if (!liveMode()) return null;
  if (await regionBlocked()) {
    return Response.json({ error: "Privi isn't available in your region." }, { status: 451, headers });
  }
  if (account) return null;
  return Response.json({ error: "Sign in with your passkey first.", authRequired: true }, { status: 401, headers });
}
