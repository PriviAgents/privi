"use client";

import { createContext, useContext } from "react";
import type { ActivityItem, Deposit, Order, WalletSnapshot, Withdrawal } from "@/lib/privi/types";

export interface AppState {
  wallet: WalletSnapshot;
  orders: Order[];
  activity: ActivityItem[];
  deposits: Deposit[];
  withdrawals: Withdrawal[];
  demo: boolean;
  /** "mainnet" | "devnet" when Privacy Rings are live; null in demo mode. */
  network: string | null;
  agentReady: boolean;
  /** Passkey session present (always true in demo mode). */
  signedIn: boolean;
  /** Latest spot prices from /api/prices, polled every 10s. Overrides wallet.prices for display. */
  live?: { prices: { SOL: number; USDC: number }; updatedAt: string; stale: boolean };
  /** Client clock when the first snapshot arrived; set by Dashboard, never during render. */
  loadedAt?: number;
}

export interface AppStore {
  state: AppState | null;
  refresh: () => Promise<void>;
  apply: (partial: Partial<AppState>) => void;
  /** Ask the chat to send a message on the user's behalf (buttons in tool cards). */
  say: (text: string) => void;
}

export const AppContext = createContext<AppStore | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp outside AppContext");
  return ctx;
}
