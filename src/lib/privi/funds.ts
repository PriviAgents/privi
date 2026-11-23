import "server-only";
import QRCode from "qrcode";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getAddressEncoder,
  getBase58Decoder,
  getBase64EncodedWireTransaction,
  pipe,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Address,
  type Instruction,
  type Signature,
} from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { getSetComputeUnitLimitInstruction, getSetComputeUnitPriceInstruction } from "@solana-program/compute-budget";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import type { Asset, Deposit, SessionState, Withdrawal } from "./types";
import { kv } from "./kv";
import { liveMode, newId, pushActivity } from "./store";
import { credit, debit, totalUsd } from "./wallet";
import { explorerTx, payFromRing, RingPaymentUncertain, signatureOutcome, solanaRpc, sweepToRing, toBase, treasuryAddress, usdcMint } from "./rings";

/**
 * Funding the private balance.
 *
 * Deposits use Solana Pay transfer requests to the Privi treasury. Each one
 * carries a unique `reference` public key, which is how a payment to the shared
 * treasury is attributed to one user. Once confirmed on-chain, the received
 * amount is credited and the treasury is swept into the Privacy Ring.
 * Withdrawals pay out of the ring to any Solana address.
 */

const DEPOSIT_TTL_MS = 30 * 60_000;
const MAX_OPEN_DEPOSITS = 3;
const MIN: Record<Asset, number> = { SOL: 0.01, USDC: 1 };
const amountKey = (asset: Asset, amount: number) => `dep:amt:${asset}:${toBase(asset, amount)}`;

function newReference(): string {
  return getBase58Decoder().decode(crypto.getRandomValues(new Uint8Array(32)));
}

function transferRequestUri(d: { recipient: string; asset: Asset; amount: number; reference: string }) {
  const p = new URLSearchParams();
  p.set("amount", d.amount.toString());
  if (d.asset === "USDC") p.set("spl-token", usdcMint());
  p.set("reference", d.reference);
  p.set("label", "Privi");
  p.set("message", "Deposit to your private balance");
  return `solana:${d.recipient}?${p.toString()}`;
}

async function qrSvg(text: string) {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0a0a0a", light: "#ffffff00" } });
}

export async function createDeposit(s: SessionState, asset: Asset, amount: number): Promise<Deposit> {
  if (!liveMode()) throw new Error("Deposits need Privacy Rings configured on the server.");
  if (!(amount >= MIN[asset])) throw new Error(`Minimum deposit is ${MIN[asset]} ${asset}.`);
  // Optional cap on what one account holds; off unless PRIVI_MAX_BALANCE_USD is set.
  const cap = Number(process.env.PRIVI_MAX_BALANCE_USD);
  if (Number.isFinite(cap) && cap > 0 && totalUsd(s) + amount * (s.wallet.prices[asset] ?? 0) > cap) {
    throw new Error(`A balance can hold up to $${cap.toLocaleString("en-US")}.`);
  }
  // Open requests reserve amounts (below), so cap how many one account holds.
  const open = s.deposits.filter((d) => d.status === "PENDING" && Date.now() < new Date(d.expiresAt).getTime());
  if (open.length >= MAX_OPEN_DEPOSITS) throw new Error("You have open deposit requests already. Finish or cancel one first.");
  const recipient = await treasuryAddress();
  const reference = newReference();
  const id = newId("dep");
  // Each open deposit asks for a distinct amount, so a transfer that arrives
  // without its reference (copied address, wallet that drops it) can still be
  // matched by exact amount. Every request gets a small random tail (under a
  // cent of USDC, under 0.001 SOL), so round amounts are never reserved: nobody can
  // squat "10 USDC" and catch someone else's plain transfer.
  const step = asset === "SOL" ? 0.00001 : 0.0001;
  const r = crypto.getRandomValues(new Uint32Array(1))[0];
  amount = Math.round((amount + step * (1 + (r % 99))) * 1e9) / 1e9;
  let reserved = false;
  for (let i = 0; i < 50; i++) {
    if (await kv.setNx(amountKey(asset, amount), id, DEPOSIT_TTL_MS / 1000 + 600)) {
      reserved = true;
      break;
    }
    amount = Math.round((amount + step) * 1e9) / 1e9;
  }
  if (!reserved) throw new Error("Couldn't open a deposit right now. Try a slightly different amount.");
  const now = Date.now();
  const paymentUri = transferRequestUri({ recipient, asset, amount, reference });
  const d: Deposit = {
    id,
    asset,
    amount,
    recipient,
    reference,
    paymentUri,
    qrSvg: await qrSvg(paymentUri),
    status: "PENDING",
    credited: false,
    expiresAt: new Date(now + DEPOSIT_TTL_MS).toISOString(),
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  s.deposits.unshift(d);
  return d;
}

/**
 * An unsigned transfer for a pending deposit, for a browser wallet to sign and
 * send. Same payment as the Solana Pay link: exact amount to the treasury,
 * with the deposit's reference key attached so `checkDeposit` finds it.
 */
export async function depositTransaction(s: SessionState, id: string, payerAddress: string): Promise<string> {
  const d = s.deposits.find((x) => x.id === id);
  if (!d || d.status !== "PENDING") throw new Error("This deposit is no longer open.");
  let payer: Address;
  try {
    payer = address(payerAddress);
  } catch {
    throw new Error("That wallet address isn't valid.");
  }
  const signer = createNoopSigner(payer);
  const treasury = address(d.recipient);
  const reference = { address: address(d.reference), role: AccountRole.READONLY };
  const withReference = (ix: Instruction): Instruction => ({ ...ix, accounts: [...(ix.accounts ?? []), reference] });

  let ixs: Instruction[];
  if (d.asset === "SOL") {
    ixs = [withReference(getTransferSolInstruction({ source: signer, destination: treasury, amount: toBase("SOL", d.amount) }))];
  } else {
    const mint = address(usdcMint());
    const [from] = await findAssociatedTokenPda({ owner: payer, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const [to] = await findAssociatedTokenPda({ owner: treasury, mint, tokenProgram: TOKEN_PROGRAM_ADDRESS });
    ixs = [
      // No-op if the treasury's USDC account already exists.
      getCreateAssociatedTokenIdempotentInstruction({ payer: signer, ata: to, owner: treasury, mint }),
      withReference(getTransferCheckedInstruction({ source: from, mint, destination: to, authority: signer, amount: toBase("USDC", d.amount), decimals: 6 })),
    ];
  }
  const { value: blockhash } = await (await solanaRpc()).getLatestBlockhash({ commitment: "confirmed" }).send();
  const msg = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    // Explicit compute budget: wallets (Phantom) warn on transactions whose
    // outcome they can't predict confidently.
    (m) =>
      appendTransactionMessageInstructions(
        [getSetComputeUnitLimitInstruction({ units: d.asset === "SOL" ? 20_000 : 60_000 }), getSetComputeUnitPriceInstruction({ microLamports: 20_000 }), ...ixs],
        m,
      ),
  );
  const wire = getBase64EncodedWireTransaction(compileTransaction(msg));
  // Simulate first, so a deposit that would fail gets a clear error here
  // instead of a scary wallet warning.
  const sim = await (await solanaRpc())
    .simulateTransaction(wire, { encoding: "base64", sigVerify: false, replaceRecentBlockhash: false, commitment: "confirmed" })
    .send();
  if (sim.value.err) {
    const logs = (sim.value.logs ?? []).join(" ");
    if (/insufficient|0x1\b/i.test(logs) || JSON.stringify(sim.value.err).includes("InsufficientFunds")) {
      throw new Error(`That wallet doesn't have enough ${d.asset} for this deposit (plus a small network fee).`);
    }
    if (/AccountNotFound|could not find account/i.test(`${logs} ${JSON.stringify(sim.value.err)}`)) {
      throw new Error(`That wallet doesn't have enough ${d.asset} for this deposit (plus a small network fee).`);
    }
    throw new Error("This deposit would fail on Solana. Check the wallet's balance and try again.");
  }
  return wire;
}

/**
 * Submit a deposit transaction the user's wallet signed (sign-only flow, which
 * Phantom recommends over sign-and-send for dApps). Sent through our RPC with
 * preflight; the usual deposit check credits it.
 */
export async function submitDepositTransaction(s: SessionState, id: string, signedBase64: string): Promise<string> {
  const d = s.deposits.find((x) => x.id === id);
  if (!d || d.status !== "PENDING") throw new Error("This deposit is no longer open.");
  if (signedBase64.length > 4000) throw new Error("Invalid transaction.");
  // Only relay the deposit's own transfer: it must reference this deposit's
  // key and the treasury, and each deposit gets a handful of attempts.
  const raw = Buffer.from(signedBase64, "base64");
  const has = (a: string) => raw.indexOf(Buffer.from(getAddressEncoder().encode(address(a)))) !== -1;
  if (!has(d.reference) || !has(d.recipient)) throw new Error("That transaction isn't this deposit.");
  const tries = await kv.incr(`dep:submit:${d.id}`, 3600);
  if (tries > 5) throw new Error("Too many attempts for this deposit. Pay from your wallet app instead.");
  const sig = await (await solanaRpc())
    .sendTransaction(signedBase64 as Parameters<Awaited<ReturnType<typeof solanaRpc>>["sendTransaction"]>[0], { encoding: "base64", preflightCommitment: "confirmed", maxRetries: BigInt(3) })
    .send();
  return String(sig);
}

/**
 * Fallback for transfers that reached the treasury without the deposit's
 * reference: a successful transfer of exactly the requested amount, inside the
 * deposit's window, that no other deposit has claimed.
 */
async function matchByAmount(d: Deposit, s: SessionState) {
  const owner = await kv.get<string>(amountKey(d.asset, d.amount));
  if (owner && owner !== d.id) return; // that amount belongs to another open deposit
  const rpc = await solanaRpc();
  const from = new Date(d.createdAt).getTime() / 1000 - 60;
  const until = new Date(d.expiresAt).getTime() / 1000 + 300;
  // Every pending deposit scans the same treasury history: share one fetch for 4s.
  const cacheKey = `treasury:sigs:${d.recipient}`;
  let sigs = await kv.get<{ signature: string; blockTime: number | null; err: boolean }[]>(cacheKey);
  if (!sigs) {
    const raw = await rpc.getSignaturesForAddress(address(d.recipient), { limit: 25, commitment: "confirmed" }).send();
    sigs = raw.map((x) => ({ signature: String(x.signature), blockTime: x.blockTime == null ? null : Number(x.blockTime), err: Boolean(x.err) }));
    await kv.set(cacheKey, sigs, 4);
  }
  for (const sig of sigs) {
    const t = Number(sig.blockTime ?? 0);
    if (sig.err || (t && (t < from || t > until))) continue;
    if (await kv.get(`dep:sig:${sig.signature}`)) continue;
    // What each treasury transaction paid in is fixed once confirmed: cache it.
    const ck = `dep:seen:${d.asset}:${sig.signature}`;
    let got = await kv.get<number>(ck);
    if (got === null || got === undefined) {
      const tx = (await rpc
        .getTransaction(sig.signature as Signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" })
        .send()) as unknown as ParsedTx | null;
      if (!tx) continue;
      got = Math.round(receivedBy(tx, d.recipient, d.asset) * 1e9) / 1e9;
      await kv.set(ck, got, 60 * 60 * 6);
    }
    if (toBase(d.asset, got) !== toBase(d.asset, d.amount)) continue;
    if (!(await kv.setNx(`dep:sig:${sig.signature}`, d.id, 60 * 60 * 24 * 365))) continue;
    d.status = "CONFIRMED";
    d.signature = sig.signature;
    d.received = got;
    credit(s, d.asset, got);
    d.credited = true;
    void import("./telemetry").then((t) => t.bump("deposits"));
    pushActivity(s, { kind: "deposit", summary: `Deposited ${d.asset} into your private balance`, amount: `+${got} ${d.asset}` });
    return;
  }
}

// Loose views over the jsonParsed transaction shape (the kit types are deep generics).
type TokenBal = { owner?: string; mint: string; uiTokenAmount: { uiAmountString?: string } };
type ParsedTx = {
  meta: { err: unknown; preBalances: (number | bigint)[]; postBalances: (number | bigint)[]; preTokenBalances?: TokenBal[]; postTokenBalances?: TokenBal[] } | null;
  transaction: { message: { accountKeys: ({ pubkey: string } | string)[] } };
};

/** Amount of `asset` the treasury gained in this transaction (0 if none). */
function receivedBy(tx: ParsedTx, treasury: string, asset: Asset): number {
  const m = tx.meta;
  if (!m || m.err) return 0;
  if (asset === "SOL") {
    const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === "string" ? k : k.pubkey));
    const i = keys.indexOf(treasury);
    if (i < 0) return 0;
    return (Number(m.postBalances[i]) - Number(m.preBalances[i])) / 1e9;
  }
  const mint = usdcMint();
  const amt = (list?: TokenBal[]) =>
    (list ?? []).filter((b) => b.owner === treasury && b.mint === mint).reduce((a, b) => a + Number(b.uiTokenAmount.uiAmountString ?? 0), 0);
  return amt(m.postTokenBalances) - amt(m.preTokenBalances);
}

/**
 * Check a pending deposit on-chain by its reference key. Credits the amount
 * actually received (once, globally, keyed by signature) and sweeps it into the ring.
 */
/**
 * Cancel an open deposit request. Checks the chain one last time first: if
 * the payment already arrived, it's credited instead and the deposit is
 * returned confirmed. Frees the deposit's reserved exact amount.
 */
export async function cancelDeposit(s: SessionState, id: string): Promise<Deposit> {
  const d = await checkDeposit(s, id, { force: true });
  if (d.status !== "PENDING") return d;
  d.status = "CANCELLED";
  d.updatedAt = new Date().toISOString();
  const key = amountKey(d.asset, d.amount);
  if ((await kv.get<string>(key)) === d.id) await kv.del(key);
  return d;
}

export async function checkDeposit(s: SessionState, id: string, opts: { force?: boolean } = {}): Promise<Deposit> {
  const d = s.deposits.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown deposit ${id}.`);
  // Several tabs or devices may poll the same deposit: check the chain at most every 4s.
  if (!opts.force && d.status === "PENDING" && Date.now() - new Date(d.updatedAt).getTime() < 4_000) return d;
  if (d.status === "PENDING") {
    const rpc = await solanaRpc();
    const sigs = await rpc.getSignaturesForAddress(address(d.reference), { limit: 5, commitment: "confirmed" }).send();
    for (const sig of sigs) {
      if (sig.err) continue;
      const tx = (await rpc
        .getTransaction(sig.signature as Signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0, commitment: "confirmed" })
        .send()) as unknown as ParsedTx | null;
      if (!tx) continue;
      const got = Math.round(receivedBy(tx, d.recipient, d.asset) * 1e9) / 1e9;
      if (got <= 0) continue;
      // A signature can credit exactly one deposit, ever.
      if (!(await kv.setNx(`dep:sig:${sig.signature}`, d.id, 60 * 60 * 24 * 365))) continue;
      d.status = "CONFIRMED";
      d.signature = sig.signature;
      d.received = got;
      credit(s, d.asset, got);
      d.credited = true;
      void import("./telemetry").then((t) => t.bump("deposits"));
      pushActivity(s, { kind: "deposit", summary: `Deposited ${d.asset} into your private balance`, amount: `+${got} ${d.asset}` });
      break;
    }
    if (d.status === "PENDING") await matchByAmount(d, s);
    if (d.status === "PENDING" && Date.now() > new Date(d.expiresAt).getTime()) d.status = "EXPIRED";
    d.updatedAt = new Date().toISOString();
  }
  if (d.status === "CONFIRMED" && d.ring?.status !== "deposited") {
    try {
      const { signatures } = await sweepToRing();
      d.ring = { status: "deposited", signatures, at: new Date().toISOString() };
    } catch (e) {
      // Funds are safe on the treasury; any later sweep picks them up.
      d.ring = { status: "failed", error: (e as Error).message, at: new Date().toISOString() };
      console.error("[privi] ring sweep failed:", (e as Error).message);
    }
  }
  return d;
}

/**
 * Pay out of the user's private balance to any Solana address.
 *
 * Write-ahead: the debit and a `pending` withdrawal are saved (via `persist`)
 * before anything is signed, and the signature is saved before it is sent. So
 * a second request, an expired lock or a killed function can never see the
 * pre-debit balance, and every broadcast payment can be found on-chain. The
 * balance is restored only when the payment definitely didn't happen: it
 * failed before signing, or its transaction never landed / failed on-chain.
 */
export async function withdraw(
  s: SessionState,
  input: { asset: Asset; amount: number; to: string },
  persist: () => Promise<void>,
): Promise<Withdrawal> {
  if (!liveMode()) throw new Error("Withdrawals need Privacy Rings configured on the server.");
  let to: Address;
  try {
    to = address(input.to);
  } catch {
    throw new Error("That is not a valid Solana address.");
  }
  debit(s, input.asset, input.amount); // throws on insufficient balance
  const w: Withdrawal = { id: newId("wd"), asset: input.asset, amount: input.amount, to, status: "pending", at: new Date().toISOString() };
  s.withdrawals.unshift(w);
  await persist();
  try {
    const { signature } = await payFromRing({ to, asset: input.asset, amount: input.amount }, async (sig) => {
      w.signature = sig;
      await persist();
    });
    w.signature = signature;
    w.status = "sent";
    pushActivity(s, { kind: "withdraw", summary: `Withdrew to ${to.slice(0, 4)}…${to.slice(-4)}`, amount: `−${input.amount} ${input.asset}` });
  } catch (e) {
    if (e instanceof RingPaymentUncertain) {
      // May still land: keep the debit, settle later from the signature.
      w.signature = e.signature;
      w.error = undefined;
    } else if (!w.signature) {
      // Failed before a transaction existed: nothing left the ring.
      credit(s, input.asset, input.amount);
      w.status = "failed";
      w.error = (e as Error).message;
    }
    // Signed but the error came from elsewhere: stays pending for reconcile.
  }
  return w;
}

// A blockhash is valid for ~150 slots (~60-90s). Past this, an unseen
// signature can no longer land.
const UNSEEN_GIVE_UP_MS = 5 * 60_000;

/**
 * Settle pending withdrawals from the chain. Landed → sent. Failed on-chain,
 * or never seen long after its blockhash expired, or never signed → refunded
 * exactly once. Returns true when anything changed.
 */
export async function reconcileWithdrawals(s: SessionState): Promise<boolean> {
  let changed = false;
  for (const w of s.withdrawals) {
    if (w.status !== "pending") continue;
    const age = Date.now() - new Date(w.at).getTime();
    let outcome: "landed" | "failed" | "pending";
    if (!w.signature) outcome = age > UNSEEN_GIVE_UP_MS ? "failed" : "pending";
    else {
      try {
        outcome = await signatureOutcome(w.signature);
      } catch {
        continue; // RPC hiccup: try again next time
      }
      if (outcome === "pending" && age > UNSEEN_GIVE_UP_MS) outcome = "failed";
    }
    if (outcome === "landed") {
      w.status = "sent";
      pushActivity(s, { kind: "withdraw", summary: `Withdrew to ${w.to.slice(0, 4)}…${w.to.slice(-4)}`, amount: `−${w.amount} ${w.asset}` });
      changed = true;
    } else if (outcome === "failed") {
      credit(s, w.asset, w.amount);
      w.status = "failed";
      w.error = "The withdrawal didn't go through on Solana. Your balance was restored.";
      changed = true;
    }
  }
  return changed;
}

export { explorerTx };
