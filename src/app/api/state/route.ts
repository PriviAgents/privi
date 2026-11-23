import { currentSession, saveSession, sessionCookieHeader } from "@/lib/privi/session";
import { liveMode, loadSession, resetSession } from "@/lib/privi/store";
import { applyPrices } from "@/lib/privi/prices";
import { kvMode, rateLimit } from "@/lib/privi/kv";
import { ringsNetwork } from "@/lib/privi/rings";
import type { Order, SessionState } from "@/lib/privi/types";

/** Orders as the dashboard needs them: no approval tokens, traveller or guest details. */
function publicOrder(o: Order) {
  const { confirmationToken: _t, ...rest } = o;
  void _t;
  const details = { ...o.details } as Record<string, unknown>;
  delete details.passengers;
  delete details.guest;
  delete details.payTo;
  return { ...rest, details };
}

async function snapshot(s: SessionState, signedIn: boolean) {
  const px = await applyPrices(s);
  const live = liveMode();
  // Live balances are only shown to their signed-in owner.
  const show = !live || signedIn;
  return {
    wallet: show ? s.wallet : { ...s.wallet, balances: s.wallet.balances.map((b) => ({ ...b, amount: 0 })) },
    orders: show ? s.orders.map(publicOrder) : [],
    activity: show ? s.activity : [],
    deposits: show ? s.deposits : [],
    withdrawals: show ? s.withdrawals : [],
    demo: !live,
    network: live ? ringsNetwork() : null,
    agentReady: Boolean(process.env.ANTHROPIC_API_KEY),
    signedIn: live ? signedIn : true, // demo needs no account
    storage: kvMode(),
    prices: { source: px.source, stale: px.stale, updatedAt: px.updatedAt },
  };
}

export async function GET() {
  const { session, setCookie, account } = await currentSession();
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (setCookie) headers["set-cookie"] = sessionCookieHeader(setCookie.value);
  return Response.json(await snapshot(session, Boolean(account)), { headers });
}

/** Demo-only: { action: "reset" }. Live balances are never reset from the browser. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  const { session, setCookie, ip, account } = await currentSession();
  const headers: Record<string, string> = {};
  if (setCookie) headers["set-cookie"] = sessionCookieHeader(setCookie.value);
  const rl = await rateLimit(`state:${ip}`, 30, 60);
  if (!rl.ok) return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers });

  if (body.action === "reset") {
    if (liveMode()) return Response.json({ error: "Reset is disabled in live mode." }, { status: 400, headers });
    await resetSession(session.id);
    const fresh = await loadSession(session.id);
    await saveSession(fresh);
    return Response.json(await snapshot(fresh, Boolean(account)), { headers });
  }
  return Response.json({ error: "unknown action" }, { status: 400, headers });
}
