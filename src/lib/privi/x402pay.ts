import "server-only";
import { x402Client } from "@x402/core/client";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { rpcUrl, spendSigner, usdcMint } from "./rings";

export const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

/** The merchant refused before taking payment (validation, not orderable…). */
export class PaymentNotTaken extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function errorText(r: Response): Promise<string> {
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } | string; message?: string; detail?: string };
  const e = typeof j.error === "string" ? j.error : j.error?.message;
  return e ?? j.message ?? j.detail ?? `HTTP ${r.status}`;
}

/**
 * POST to an x402-paid endpoint, paying in USDC on Solana from the spend
 * wallet. Refuses to pay more than `maxUsd`, or anything other than exactly
 * `exactBase` (USDC base units) when given. A response other than 402 on the
 * first call is returned unpaid (free refusals, cached answers).
 */
export async function x402Post(url: string, body: unknown, opts: { maxUsd: number; exactBase?: bigint; timeoutMs?: number; headers?: Record<string, string> }): Promise<Response> {
  const init = { method: "POST", headers: { "content-type": "application/json", ...(opts.headers ?? {}) }, body: JSON.stringify(body) };
  const first = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (first.status !== 402) {
    if (!first.ok) throw new PaymentNotTaken(await errorText(first), first.status);
    return first;
  }
  const header = first.headers.get("payment-required");
  if (!header) throw new PaymentNotTaken("No payment terms returned.", 402);
  const required = decodePaymentRequiredHeader(header);
  const accept = required.accepts.find((a) => a.network === SOLANA_MAINNET && a.scheme === "exact");
  if (!accept || accept.asset !== usdcMint()) throw new PaymentNotTaken("USDC on Solana isn't accepted here right now.", 402);
  const amount = BigInt(accept.amount);
  if (opts.exactBase !== undefined && amount !== opts.exactBase) throw new PaymentNotTaken("The price changed. Nothing was paid.", 402);
  if (Number(amount) / 1e6 > opts.maxUsd + 1e-9) throw new PaymentNotTaken("The price is higher than approved. Nothing was paid.", 402);

  const client = new x402Client()
    .register(SOLANA_MAINNET, new ExactSvmScheme(await spendSigner(), { rpcUrl: rpcUrl() }))
    .setSpendControls({ maxAmountPerPayment: `$${(Number(amount) / 1e6).toFixed(6)}` });
  const payload = await client.createPaymentPayload({ ...required, accepts: [accept] });
  const paid = await fetch(url, {
    ...init,
    headers: { ...init.headers, "PAYMENT-SIGNATURE": encodePaymentSignatureHeader(payload) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  if (!paid.ok && (paid.status === 400 || paid.status === 409 || paid.status === 422)) throw new PaymentNotTaken(await errorText(paid), paid.status);
  if (!paid.ok) throw new Error(`Payment wasn't confirmed (${await errorText(paid)}).`);
  return paid;
}
