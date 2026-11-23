// Core domain types for Privi.
// Each user holds a private SOL/USDC balance. Funds sit in Privi's Helius
// Privacy Ring (pooled, amounts encrypted on-chain); the per-user split is
// this ledger. Amounts are display units (SOL, USDC).

export type Asset = "SOL" | "USDC";

export interface AssetBalance {
  asset: Asset;
  amount: number;
}

export interface WalletSnapshot {
  balances: AssetBalance[];
  /** Spot prices in USD, for display and budgeting. */
  prices: Record<Asset, number>;
  updatedAt: string;
}

export type OrderKind = "flight" | "hotel" | "giftcard" | "product" | "food";

export type OrderStatus =
  | "proposed"
  | "awaiting_confirmation"
  | "paid"
  | "fulfilled"
  | "failed"
  | "cancelled";

export interface Order {
  id: string;
  kind: OrderKind;
  title: string;
  subtitle?: string;
  merchant: string;
  rail: string;
  priceUsd: number;
  payAsset: Asset;
  payAmount: number;
  status: OrderStatus;
  details: Record<string, unknown>;
  /** Short-lived token the agent must echo back to confirm a purchase. */
  confirmationToken?: string;
  createdAt: string;
  updatedAt: string;
  reference?: string;
}

export interface ActivityItem {
  id: string;
  at: string;
  kind: "deposit" | "withdraw" | "purchase" | "system";
  summary: string;
  amount?: string;
}

export type DepositStatus = "PENDING" | "CONFIRMED" | "EXPIRED" | "CANCELLED";

/**
 * A Solana Pay deposit into the Privacy Ring. The unique `reference` key is
 * attached to the payment so the pooled treasury can attribute it to a user.
 */
export interface Deposit {
  id: string;
  asset: Asset;
  amount: number;
  /** Treasury address the user pays (public). */
  recipient: string;
  /** Solana Pay reference public key, unique per deposit. */
  reference: string;
  /** solana: transfer-request URI encoding recipient, amount, token, reference. */
  paymentUri: string;
  /** Inline SVG QR for paymentUri. */
  qrSvg: string;
  status: DepositStatus;
  /** Amount actually received, once confirmed. */
  received?: number;
  signature?: string;
  credited: boolean;
  /** Sweep of the received funds into the ring. */
  ring?: { status: "deposited" | "failed"; signatures?: string[]; error?: string; at: string };
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface Withdrawal {
  id: string;
  asset: Asset;
  amount: number;
  to: string;
  /** pending: debited, payment submitted or in flight; settled by reconcileWithdrawals. */
  status: "pending" | "sent" | "failed";
  signature?: string;
  error?: string;
  at: string;
}

/** A normalized search result the agent can later reserve with prepare_purchase. */
export interface StoredOffer {
  id: string;
  kind: OrderKind;
  title: string;
  subtitle: string;
  merchant: string;
  rail: string;
  priceUsd: number;
  details: Record<string, unknown>;
}

export interface SessionState {
  id: string;
  wallet: WalletSnapshot;
  orders: Order[];
  deposits: Deposit[];
  withdrawals: Withdrawal[];
  activity: ActivityItem[];
  /** Recent search results, newest first, so a later request can reserve one. */
  offers: StoredOffer[];
  /** Last shipping address used for a product order (reused on the next one). */
  shipping?: import("./zinc").ShippingAddress;
}
