import { z } from "zod";
import { getPrices } from "@/lib/privi/prices";
import { serverError } from "@/lib/privi/telemetry";
import { currentSession, lockSession, requireSignedIn, saveSession, sessionCookieHeader } from "@/lib/privi/session";
import { loadSession } from "@/lib/privi/store";
import { rateLimit } from "@/lib/privi/kv";
import { checkDeposit, createDeposit,
  depositTransaction, cancelDeposit, reconcileWithdrawals, submitDepositTransaction, withdraw } from "@/lib/privi/funds";
import { DEMO_FAUCET, liveMode } from "@/lib/privi/store";
import { demoFund } from "@/lib/privi/wallet";
import type { SessionState } from "@/lib/privi/types";

export const maxDuration = 120; // ring sweeps and withdrawals prove + confirm on-chain

const Asset = z.enum(["SOL", "USDC"]);
let livePrices: SessionState["wallet"]["prices"] | null = null;

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("deposit"), asset: Asset, amount: z.number().positive().max(1_000_000) }),
  z.object({ action: z.literal("status"), depositId: z.string() }),
  z.object({ action: z.literal("cancel-deposit"), depositId: z.string() }),
  z.object({ action: z.literal("deposit-submit"), depositId: z.string(), transaction: z.string().min(100).max(4000) }),
  z.object({ action: z.literal("deposit-tx"), depositId: z.string(), payer: z.string().min(32).max(44) }),
  z.object({ action: z.literal("withdraw"), asset: Asset, amount: z.number().positive(), to: z.string().min(32).max(44) }),
  z.object({ action: z.literal("faucet"), asset: Asset }),
  z.object({ action: z.literal("withdrawals") }),
]);

function slice(s: SessionState) {
  return { wallet: { ...s.wallet, prices: { ...(livePrices ?? s.wallet.prices) } }, activity: s.activity, deposits: s.deposits, withdrawals: s.withdrawals };
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { session: initial, setCookie, ip, account } = await currentSession();
  let session = initial;
  livePrices = (await getPrices()).prices;
  const headers: Record<string, string> = {};
  if (setCookie) headers["set-cookie"] = sessionCookieHeader(setCookie.value);

  // Deposit status polls every few seconds; withdrawals are rarer and capped separately.
  const rl = await rateLimit(`funds:${session.id}:${ip}`, 60, 60);
  if (!rl.ok) return Response.json({ error: "Too many requests. Try again shortly." }, { status: 429, headers });

  const b = parsed.data;
  if (b.action !== "faucet") {
    const gate = await requireSignedIn(account, headers);
    if (gate) return gate;
  }
  // Money-changing actions run under the account lock on a fresh copy. A
  // status poll that finds the account busy just reports the current state;
  // the next poll checks again.
  let unlock: (() => Promise<void>) | null = null;
  if (b.action !== "deposit-tx" && b.action !== "deposit-submit") {
    // The lock must outlive the function (maxDuration 120s): a withdrawal can
    // prove, confirm and re-sync for most of that.
    unlock = await lockSession(initial.id, 150, b.action === "status" || b.action === "withdrawals" ? 0 : 8_000);
    if (!unlock) {
      if (b.action === "status") return Response.json({ deposit: initial.deposits.find((d) => d.id === b.depositId), ...slice(initial) }, { headers });
      if (b.action === "withdrawals") return Response.json(slice(initial), { headers });
      return Response.json({ error: "Still finishing your last request. Try again in a moment." }, { status: 409, headers });
    }
    session = await loadSession(initial.id);
  }
  try {
    // Settle any withdrawal whose on-chain outcome wasn't known yet.
    if (unlock && session.withdrawals.some((w) => w.status === "pending")) {
      if (await reconcileWithdrawals(session)) await saveSession(session);
    }
    switch (b.action) {
      case "deposit": {
        const deposit = await createDeposit(session, b.asset, b.amount);
        await saveSession(session);
        return Response.json({ deposit, ...slice(session) }, { headers });
      }
      case "deposit-tx":
        return Response.json({ transaction: await depositTransaction(session, b.depositId, b.payer) }, { headers });
      case "deposit-submit":
        return Response.json({ signature: await submitDepositTransaction(session, b.depositId, b.transaction) }, { headers });
      case "cancel-deposit": {
        const deposit = await cancelDeposit(session, b.depositId);
        await saveSession(session);
        return Response.json({ deposit, ...slice(session) }, { headers });
      }
      case "status": {
        const deposit = await checkDeposit(session, b.depositId);
        await saveSession(session);
        return Response.json({ deposit, ...slice(session) }, { headers });
      }
      case "withdraw": {
        const wl = await rateLimit(`withdraw:${session.id}`, 5, 3600);
        if (!wl.ok) return Response.json({ error: "Withdrawal limit reached. Try again later." }, { status: 429, headers });
        const s = session;
        const withdrawal = await withdraw(s, b, () => saveSession(s));
        await saveSession(s);
        if (withdrawal.status === "failed") return Response.json({ error: withdrawal.error, withdrawal, ...slice(s) }, { status: 502, headers });
        return Response.json({ withdrawal, ...slice(s) }, { status: withdrawal.status === "pending" ? 202 : 200, headers });
      }
      case "withdrawals": {
        return Response.json(slice(session), { headers });
      }
      case "faucet": {
        if (liveMode()) return Response.json({ error: "The demo faucet is disabled in live mode." }, { status: 400, headers });
        demoFund(session, b.asset, DEMO_FAUCET[b.asset]);
        await saveSession(session);
        return Response.json(slice(session), { headers });
      }
    }
  } catch (e) {
    await serverError(`funds:${b.action}`, e, initial.id);
    return Response.json({ error: (e as Error).message }, { status: 400, headers });
  } finally {
    await unlock?.().catch(() => {});
  }
}
