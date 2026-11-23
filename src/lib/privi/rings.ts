import "server-only";
import {
  address,
  createKeyPairSignerFromPrivateKeyBytes,
  getBase58Decoder,
  getBase58Encoder,
  getSignatureFromTransaction,
  sendTransactionWithoutConfirmingFactory,
  signTransactionWithSigners,
  type Address,
  type KeyPairSigner,
  type Transaction,
} from "@solana/kit";
import { findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import {
  buildDepositTransaction,
  buildRegistrationTransaction,
  buildWithdrawalTransaction,
  getPrivateTokenBalances,
  initializePoseidon,
  loadPersistedWallet,
  LocalKeys,
  ShieldedKeypair,
  SigningKey,
  SOL_MINT,
  syncPersistedWallet,
  Wallet,
  walletSnapshotCipher,
  type Bytes32,
  type WalletStateStore,
} from "@heliuslabs/spr";
import { SignedTeePolicy, SprClient } from "@heliuslabs/spr/client";
import { kv, withLock } from "./kv";

/**
 * Helius Solana Privacy Rings — the private spend balance for Privi's Solana
 * payment leg.
 *
 *   user wallet ──Solana Pay deposit──▶ treasury (public) ──sweep──▶ ring
 *   ring ──withdraw──▶ merchant (public address, amount visible)
 *
 * One Privi treasury wallet owns the ring balance (custodial). In the default
 * ring, amounts and assets are encrypted on-chain; sender/recipient addresses
 * are not. Deposits and withdrawals reveal their own amount. SDK 0.9.0-alpha
 * (beta, OtterSec audit pending at time of writing) — keep balances modest.
 */

export type RingAsset = "SOL" | "USDC";
type Network = "mainnet" | "devnet";

const NETWORK: Network = process.env.PRIVI_RINGS_NETWORK === "devnet" ? "devnet" : "mainnet";

// Unified Helius /v1/spr gateway (indexer + prover), authenticated by the API key.
// The README's CloudFront hosts reject keyed requests (403). Override via env if needed.
const DEFAULTS: Record<Network, { rpc: string; indexer: string; prover: string; usdc: string }> = {
  mainnet: {
    rpc: "https://mainnet.helius-rpc.com/",
    indexer: "https://mainnet.helius-rpc.com/v1/spr",
    prover: "https://mainnet.helius-rpc.com/v1/spr",
    usdc: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  },
  devnet: {
    rpc: "https://devnet.helius-rpc.com/",
    indexer: "https://devnet.helius-rpc.com/v1/spr",
    prover: "https://devnet.helius-rpc.com/v1/spr",
    usdc: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  },
};
const DECIMALS: Record<RingAsset, number> = { SOL: 9, USDC: 6 };

export function ringsConfigured(): boolean {
  return Boolean(process.env.HELIUS_API_KEY && process.env.PRIVI_TREASURY_SECRET);
}

function mintOf(asset: RingAsset): Address {
  if (asset === "SOL") return SOL_MINT as Address;
  return address(process.env.PRIVI_RINGS_USDC_MINT ?? DEFAULTS[NETWORK].usdc);
}

export const toBase = (asset: RingAsset, amount: number) => BigInt(Math.round(amount * 10 ** DECIMALS[asset]));
export const fromBase = (asset: RingAsset, base: bigint) => Number(base) / 10 ** DECIMALS[asset];

/**
 * Accepts the treasury secret as a solana-keygen JSON array (64 bytes), a
 * base58 64-byte secret key (Phantom export), or a base58 32-byte seed. The
 * first 32 bytes are the Ed25519 seed used for both the Solana signer and the
 * shielded keypair (the SDK requires they share it).
 */
function treasurySeed(): Uint8Array {
  const raw = (process.env.PRIVI_TREASURY_SECRET ?? "").trim();
  if (!raw) throw new Error("PRIVI_TREASURY_SECRET is not configured.");
  const bytes = raw.startsWith("[") ? Uint8Array.from(JSON.parse(raw) as number[]) : new Uint8Array(getBase58Encoder().encode(raw));
  if (bytes.length !== 64 && bytes.length !== 32) throw new Error("PRIVI_TREASURY_SECRET must be a 32-byte seed or 64-byte secret key.");
  return bytes.slice(0, 32);
}

interface Treasury {
  client: SprClient;
  signer: KeyPairSigner;
  keypair: ShieldedKeypair;
  keys: LocalKeys;
  store: WalletStateStore;
  cipher: ReturnType<typeof walletSnapshotCipher>;
}

let treasuryPromise: Promise<Treasury> | null = null;

function getTreasury(): Promise<Treasury> {
  return (treasuryPromise ??= (async () => {
    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) throw new Error("HELIUS_API_KEY is not configured.");
    await initializePoseidon();
    const d = DEFAULTS[NETWORK];
    const rpc = new URL(process.env.HELIUS_RPC_URL ?? d.rpc);
    rpc.searchParams.set("api-key", apiKey);
    // The SDK sends `apiKey` only on indexer calls; the prover (including its
    // TEE attestation) needs the key in its URL or Helius refuses it. Putting it
    // on the indexer URL too is rejected as invalid config.
    const withKey = (u: string) => {
      const url = new URL(u);
      url.searchParams.set("api-key", apiKey);
      return url;
    };
    const client = new SprClient({
      solanaRpcUrl: rpc,
      indexerUrl: process.env.HELIUS_SPR_INDEXER_URL ?? d.indexer, // key sent via `apiKey`
      proverUrl: withKey(process.env.HELIUS_SPR_PROVER_URL ?? d.prover),
      apiKey,
      proverTee: SignedTeePolicy.forNetwork(NETWORK),
      commitment: "confirmed",
    });
    const seed = treasurySeed();
    const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
    const keypair = ShieldedKeypair.fromKeypair(SigningKey.fromEd25519Bytes(seed as Bytes32)); // length checked in treasurySeed()
    seed.fill(0);
    const keys = LocalKeys.fromKeypair(keypair, client.proofService);
    // Encrypted (AES-256-GCM, keyed from the treasury keypair) wallet snapshot in Redis.
    const key = `ring:wallet:${NETWORK}:${signer.address}`;
    const store: WalletStateStore = {
      // The snapshot is a JSON string; Upstash's client parses JSON on read, so
      // turn it back into the exact string the SDK wrote.
      load: async () => {
        const v = await kv.get<unknown>(key);
        if (v === null || v === undefined) return undefined;
        return typeof v === "string" ? v : JSON.stringify(v);
      },
      save: async (snapshot) => kv.set(key, snapshot),
    };
    return { client, signer, keypair, keys, store, cipher: walletSnapshotCipher(keypair) };
  })().catch((e) => {
    treasuryPromise = null; // let the next call retry a failed init
    throw e;
  }));
}

/** Public Solana address of the treasury — where users send deposits. */
export async function treasuryAddress(): Promise<Address> {
  return (await getTreasury()).signer.address;
}

async function submit(t: Treasury, tx: Transaction): Promise<{ signature: string; slot: bigint }> {
  const signed = await signTransactionWithSigners([t.signer], tx);
  const send = sendTransactionWithoutConfirmingFactory({ rpc: t.client.solanaRpc });
  await send(signed as Parameters<typeof send>[0], { commitment: "confirmed" });
  const signature = getSignatureFromTransaction(signed);
  const slot = await t.client.confirmTransaction(signature);
  return { signature, slot };
}

/** Load the persisted wallet and sync it (optionally past a landed slot). */
async function syncedWallet(t: Treasury, requireSlot?: bigint): Promise<Wallet> {
  const wallet = (await loadPersistedWallet({ store: t.store, cipher: t.cipher })) ?? new Wallet({ identity: t.keypair.shieldedAddress() });
  await syncPersistedWallet({
    client: t.client,
    wallet,
    keys: t.keys,
    store: t.store,
    cipher: t.cipher,
    config: requireSlot !== undefined ? { requireSlot } : undefined,
  });
  return wallet;
}

/** Idempotent: publishes the treasury's shielded keys in the on-chain registry. */
async function ensureRegistered(t: Treasury): Promise<void> {
  const reg = await buildRegistrationTransaction({ client: t.client, owner: t.signer.address, address: t.keypair.shieldedAddress() });
  if (reg !== undefined) await submit(t, reg);
}

export interface RingBalances {
  network: Network;
  treasury: string;
  private: Record<RingAsset, number>;
  publicSol: number;
}

export async function ringBalances(): Promise<RingBalances> {
  const t = await getTreasury();
  return withLock(`ring:${t.signer.address}`, async () => {
    const wallet = await syncedWallet(t);
    const priv: Record<RingAsset, number> = { SOL: 0, USDC: 0 };
    for (const b of getPrivateTokenBalances(wallet)) {
      if (b.mint === mintOf("SOL")) priv.SOL = fromBase("SOL", b.amount);
      else if (b.mint === mintOf("USDC")) priv.USDC = fromBase("USDC", b.amount);
    }
    const { value } = await t.client.solanaRpc.getBalance(t.signer.address).send();
    return { network: NETWORK, treasury: t.signer.address, private: priv, publicSol: Number(value) / 1e9 };
  });
}

/**
 * Move public treasury funds into the ring (after a deposit lands). For USDC the
 * source is the treasury's associated token account. Returns the signature.
 */
export async function depositToRing(asset: RingAsset, amount: number): Promise<{ signature: string }> {
  const t = await getTreasury();
  return withLock(`ring:${t.signer.address}`, async () => {
    await ensureRegistered(t);
    const base = toBase(asset, amount);
    if (base <= BigInt(0)) throw new Error("Deposit amount must be positive.");
    const splTokenAccount =
      asset === "USDC"
        ? (await findAssociatedTokenPda({ owner: t.signer.address, mint: mintOf("USDC"), tokenProgram: TOKEN_PROGRAM_ADDRESS }))[0]
        : undefined;
    const tx = await buildDepositTransaction({
      client: t.client,
      feePayer: t.signer.address,
      recipient: t.keypair.shieldedAddress(),
      ...(asset === "USDC" ? { asset: mintOf("USDC"), splTokenAccount } : {}),
      amount: base,
    });
    const { signature, slot } = await submit(t, tx);
    await syncedWallet(t, slot); // record the new UTXO before the next spend
    return { signature };
  });
}

/**
 * Move whatever public value sits on the treasury into the ring: all USDC, and
 * SOL above a fee reserve. Works from real on-chain balances, so it is safe to
 * call repeatedly (after every deposit, from ops) and never double-deposits.
 */
export async function sweepToRing(): Promise<{ deposited: Partial<Record<RingAsset, number>>; signatures: string[] }> {
  const t = await getTreasury();
  const deposited: Partial<Record<RingAsset, number>> = {};
  const signatures: string[] = [];

  const ata = (await findAssociatedTokenPda({ owner: t.signer.address, mint: mintOf("USDC"), tokenProgram: TOKEN_PROGRAM_ADDRESS }))[0];
  let usdc = 0;
  try {
    const { value } = await t.client.solanaRpc.getTokenAccountBalance(ata).send();
    usdc = Number(value.uiAmountString ?? 0);
  } catch {
    usdc = 0; // no token account yet: nothing to sweep
  }
  if (usdc > 0) {
    signatures.push((await depositToRing("USDC", usdc)).signature);
    deposited.USDC = usdc;
  }

  const reserve = Number(process.env.PRIVI_TREASURY_SOL_RESERVE ?? 0.05); // keeps fees + rent payable
  const { value: lamports } = await t.client.solanaRpc.getBalance(t.signer.address).send();
  const excess = Math.floor((Number(lamports) / 1e9 - reserve) * 1e6) / 1e6;
  if (excess >= 0.001) {
    signatures.push((await depositToRing("SOL", excess)).signature);
    deposited.SOL = excess;
  }
  return { deposited, signatures };
}

/**
 * Pay a public Solana address from the private ring balance (withdrawal).
 * The recipient and amount become public for this one payment; the rest of the
 * balance and its history stay encrypted.
 */
export async function payFromRing(input: { to: string; asset: RingAsset; amount: number }): Promise<{ signature: string }> {
  const t = await getTreasury();
  return withLock(`ring:${t.signer.address}`, async () => {
    const wallet = await syncedWallet(t);
    const tx = await buildWithdrawalTransaction({
      client: t.client,
      wallet,
      keys: t.keys,
      feePayer: t.signer.address,
      recipient: address(input.to),
      ...(input.asset === "USDC" ? { asset: mintOf("USDC") } : {}),
      amount: toBase(input.asset, input.amount),
    });
    const { signature, slot } = await submit(t, tx);
    await syncedWallet(t, slot);
    return { signature };
  });
}

export const ringsNetwork = () => NETWORK;
export const explorerTx = (sig: string) => `https://orbmarkets.io/tx/${sig}${NETWORK === "devnet" ? "?cluster=devnet" : ""}`;

// Re-exported for scripts that need to generate or inspect a treasury key.
export const base58 = { encode: (b: Uint8Array) => getBase58Decoder().decode(b) };

/** Publish the treasury's shielded keys (idempotent). Needed once per treasury. */
export async function registerTreasury(): Promise<{ address: string }> {
  const t = await getTreasury();
  await withLock(`ring:${t.signer.address}`, () => ensureRegistered(t));
  return { address: t.signer.address };
}

/** Solana RPC (Helius) used by the rings client, for deposit verification. */
export async function solanaRpc() {
  return (await getTreasury()).client.solanaRpc;
}

export const usdcMint = (): string => mintOf("USDC");

// --- Spend wallet ---------------------------------------------------------------
//
// Some merchants (Zinc, via x402) need a payment signed by an ordinary Solana
// wallet. Privi's spend wallet is derived from the treasury seed, so there is
// no extra secret to manage. It's topped up from the ring per order with only
// what that order needs; any refund a merchant sends back stays here as float
// for the next order. Gas comes from the treasury's public fee reserve.

let spendPromise: Promise<KeyPairSigner> | null = null;

export function spendSigner(): Promise<KeyPairSigner> {
  return (spendPromise ??= (async () => {
    const { createHash } = await import("node:crypto");
    const seed = treasurySeed();
    const derived = createHash("sha256").update("privi:spend-wallet:v1").update(seed).digest();
    seed.fill(0);
    return createKeyPairSignerFromPrivateKeyBytes(new Uint8Array(derived));
  })());
}

/** Helius RPC URL with the API key, for clients that take a URL. */
export function rpcUrl(): string {
  const u = new URL(process.env.HELIUS_RPC_URL ?? DEFAULTS[NETWORK].rpc);
  u.searchParams.set("api-key", process.env.HELIUS_API_KEY ?? "");
  return u.toString();
}

/** Sign (with the given signers) and send a transaction, wait for confirmation. */
export async function sendSigned(tx: Transaction, signers: KeyPairSigner[]): Promise<string> {
  const t = await getTreasury();
  const signed = await signTransactionWithSigners(signers, tx);
  const send = sendTransactionWithoutConfirmingFactory({ rpc: t.client.solanaRpc });
  await send(signed as Parameters<typeof send>[0], { commitment: "confirmed" });
  const signature = getSignatureFromTransaction(signed);
  await t.client.confirmTransaction(signature);
  return signature;
}

/** Public SOL and USDC on the spend wallet. */
export async function spendBalances(): Promise<{ address: string; sol: number; usdc: number }> {
  const t = await getTreasury();
  const s = await spendSigner();
  const { value: lamports } = await t.client.solanaRpc.getBalance(s.address).send();
  const ata = (await findAssociatedTokenPda({ owner: s.address, mint: mintOf("USDC"), tokenProgram: TOKEN_PROGRAM_ADDRESS }))[0];
  let usdc = 0;
  try {
    const { value } = await t.client.solanaRpc.getTokenAccountBalance(ata).send();
    usdc = Number(value.uiAmountString ?? 0);
  } catch {
    usdc = 0;
  }
  return { address: s.address, sol: Number(lamports) / 1e9, usdc };
}

/**
 * Make sure the spend wallet can transact: some SOL for fees and its USDC
 * account. Paid from the treasury's public fee reserve, not user funds.
 */
export async function ensureSpendReady(minSol = 0.004): Promise<void> {
  const t = await getTreasury();
  const s = await spendSigner();
  const { getTransferSolInstruction } = await import("@solana-program/system");
  const { getCreateAssociatedTokenIdempotentInstruction } = await import("@solana-program/token");
  const kit = await import("@solana/kit");
  const bal = await spendBalances();
  const ixs: import("@solana/kit").Instruction[] = [];
  if (bal.sol < minSol) {
    ixs.push(getTransferSolInstruction({ source: t.signer, destination: s.address, amount: BigInt(Math.round(0.01 * 1e9)) }));
  }
  const ata = (await findAssociatedTokenPda({ owner: s.address, mint: mintOf("USDC"), tokenProgram: TOKEN_PROGRAM_ADDRESS }))[0];
  const { value: acct } = await t.client.solanaRpc.getAccountInfo(ata, { encoding: "base64" }).send();
  if (!acct) ixs.push(getCreateAssociatedTokenIdempotentInstruction({ payer: t.signer, ata, owner: s.address, mint: mintOf("USDC") }));
  if (!ixs.length) return;
  const { value: blockhash } = await t.client.solanaRpc.getLatestBlockhash({ commitment: "confirmed" }).send();
  const msg = kit.pipe(
    kit.createTransactionMessage({ version: 0 }),
    (m) => kit.setTransactionMessageFeePayerSigner(t.signer, m),
    (m) => kit.setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => kit.appendTransactionMessageInstructions(ixs, m),
  );
  await sendSigned(kit.compileTransaction(msg), [t.signer]);
}
