import { currentSession, lockSession, requireSignedIn, saveSession, sessionCookieHeader } from "@/lib/privi/session";
import { loadSession } from "@/lib/privi/store";
import { rateLimit } from "@/lib/privi/kv";
import { orderSettled, refreshOrder } from "@/lib/agent/tools";
import type { Order } from "@/lib/privi/types";

export const maxDuration = 30;

/** The user's own order, minus internals the page doesn't need. */
function view(o: Order) {
  const { confirmationToken: _t, ...rest } = o;
  void _t;
  const d = { ...o.details } as Record<string, unknown>;
  delete d.passengers;
  delete d.guest;
  delete d.payTo;
  return { ...rest, details: d, settled: orderSettled(o) };
}

/**
 * GET an order and refresh its status from the merchant (Zinc, BRIJ,
 * Bitrefill). Refreshes run under the account lock; if the account is busy
 * (a chat turn in flight), the stored copy is returned and the page retries.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { session: initial, setCookie, ip, account } = await currentSession();
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (setCookie) headers["set-cookie"] = sessionCookieHeader(setCookie.value);
  const gate = await requireSignedIn(account, headers);
  if (gate) return gate;
  const rl = await rateLimit(`order:${initial.id}:${ip}`, 30, 60);

  const stored = initial.orders.find((o) => o.id === id);
  if (!stored) return Response.json({ error: "Order not found." }, { status: 404, headers });
  if (!rl.ok || orderSettled(stored)) return Response.json({ order: view(stored) }, { headers });

  const unlock = await lockSession(initial.id, 45, 0); // outlives the 30s function
  if (!unlock) return Response.json({ order: view(stored), stale: true }, { headers });
  try {
    const session = await loadSession(initial.id);
    const order = session.orders.find((o) => o.id === id)!;
    try {
      await refreshOrder(session, order);
      await saveSession(session);
    } catch (e) {
      return Response.json({ order: view(order), refreshError: (e as Error).message }, { headers });
    }
    return Response.json({ order: view(order) }, { headers });
  } finally {
    await unlock();
  }
}
