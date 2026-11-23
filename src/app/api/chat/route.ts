import Anthropic from "@anthropic-ai/sdk";
import { currentSession, lockSession, requireSignedIn, saveSession, sessionCookieHeader } from "@/lib/privi/session";
import { rateLimit } from "@/lib/privi/kv";
import { deleteTranscript, loadSession } from "@/lib/privi/store";
import { acquireChatSlot, recordSpend, spendGate, usageMicros } from "@/lib/privi/limits";
import { bump, serverError } from "@/lib/privi/telemetry";
import { runAgentTurn, type AgentEvent } from "@/lib/agent/run";
import { reconcileWithdrawals } from "@/lib/privi/funds";

export const maxDuration = 120;

export async function POST(req: Request) {
  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = (body.message ?? "").trim();
  if (!text) return Response.json({ error: "message is required" }, { status: 400 });
  if (text.length > 4000) return Response.json({ error: "message too long" }, { status: 413 });

  const { session: initial, setCookie, ip, account } = await currentSession();
  const cookieHeaders: Record<string, string> = {};
  if (setCookie) cookieHeaders["set-cookie"] = sessionCookieHeader(setCookie.value);

  const gate = await requireSignedIn(account, cookieHeaders);
  if (gate) return gate;

  // Every turn spends model tokens: cap bursts and daily volume per client.
  const who = `${initial.id}:${ip}`;
  const [minute, day] = await Promise.all([rateLimit(`chat:m:${who}`, 12, 60), rateLimit(`chat:d:${who}`, 200, 86_400)]);
  if (!minute.ok || !day.ok) {
    const msg = !minute.ok ? `Slow down a little — try again in ${minute.resetSec}s.` : "Daily message limit reached. Try again tomorrow.";
    return Response.json({ error: msg }, { status: 429, headers: cookieHeaders });
  }
  const over = await spendGate(initial.id);
  if (over) return Response.json({ error: over }, { status: 429, headers: cookieHeaders });

  const releaseSlot = await acquireChatSlot();
  if (!releaseSlot) {
    return Response.json(
      { error: "Privi is handling a lot of requests right now. Try again in a few seconds.", retryAfter: 5 },
      { status: 503, headers: { ...cookieHeaders, "retry-after": "5" } },
    );
  }
  const unlock = await lockSession(initial.id, 130, 2_000);
  if (!unlock) {
    await releaseSlot();
    return Response.json({ error: "Still finishing your last request. One moment." }, { status: 409, headers: cookieHeaders });
  }
  // Fresh copy inside the lock: nothing else can change this account until we release it.
  const session = await loadSession(initial.id);
  // Settle any withdrawal whose on-chain outcome wasn't known yet (best effort).
  if (session.withdrawals.some((w) => w.status === "pending")) {
    await reconcileWithdrawals(session).catch(() => false);
  }
  let micros = 0;
  await bump("chats");
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: AgentEvent) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        for await (const ev of runAgentTurn(session, text, (u) => (micros += usageMicros(u)))) {
          // Persist as soon as a tool changes money or orders, not just at the end.
          if (ev.type === "state") await saveSession(session);
          send(ev);
        }
      } catch (err) {
        await serverError("chat", err, session.id);
        send({ type: "error", message: describeError(err) });
        send({ type: "done", stopReason: "error" });
      } finally {
        await saveSession(session).catch(() => {});
        await recordSpend(session.id, micros);
        await unlock().catch(() => {});
        await releaseSlot();
        controller.close();
      }
    },
  });

  const headers: Record<string, string> = {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  };
  Object.assign(headers, cookieHeaders);
  return new Response(stream, { headers });
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Anthropic API key is invalid.";
  if (err instanceof Anthropic.RateLimitError) return "Rate limited by the model API. Try again shortly.";
  if (err instanceof Anthropic.APIConnectionError) return "Could not reach the model API.";
  if (err instanceof Anthropic.APIError) return `Model API error (${err.status}): ${err.message}`;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

/**
 * Delete chat history: erases the stored conversation for this account.
 * Balances and orders are unaffected. Waits briefly if a reply is streaming.
 */
export async function DELETE() {
  const { session, setCookie, account } = await currentSession();
  const headers: Record<string, string> = {};
  if (setCookie) headers["set-cookie"] = sessionCookieHeader(setCookie.value);
  const gate = await requireSignedIn(account, headers);
  if (gate) return gate;
  const unlock = await lockSession(session.id, 30, 8_000);
  if (!unlock) return Response.json({ error: "A reply is still in progress. Try again in a moment." }, { status: 409, headers });
  try {
    await deleteTranscript(session.id);
    return Response.json({ deleted: true }, { headers });
  } finally {
    await unlock();
  }
}
