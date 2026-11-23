# Architecture

Privi is **a private SOL/USDC balance in a Helius Solana Privacy Ring, plus an agent that pays merchants from it**, with the user approving every purchase.

## Money flow

```
user wallet ──Solana Pay (reference key)──▶ treasury (public) ──sweep──▶ Privacy Ring (encrypted)
                                                                               │
                                               agent, on approval ─────────────┤──▶ merchant / spend wallet
                                               user, on request   ─────────────┘──▶ any address
```

- **Custody.** One treasury key owns the pooled ring balance. `wallet.ts` keeps a per-user ledger: every credit and debit is recorded against the user's account, and nothing is spent beyond a user's own balance.
- **Deposits** (`funds.ts`). Each deposit gets a unique Solana Pay `reference` key and a unique amount. A deposit is credited when a confirmed transaction carrying its reference reaches the treasury, or, as a fallback, a transfer of exactly its amount inside its time window. Each transaction signature can be credited only once. Credited funds are then swept into the ring.
- **Purchases** (`merchants.ts`, `agent/tools.ts`). The agent prepares an order with an exact amount (the merchant price plus Privi's 2% fee). Paying requires a server-side approval check: the order must have been shown to the user in an earlier turn, and the user's own message in the current turn must approve it. Text from web pages or tool results can't satisfy it.
- **Spend wallet.** Merchants paid via [x402](https://www.x402.org) are paid from a small hot wallet that is topped up from the ring in round lots, so individual purchases aren't linkable to ring withdrawals by amount.
- **Refunds.** Failed orders, unticketed fares and unused store budget return to the user's balance in USDC, with the matching share of the fee.
- **Withdrawals.** The ledger is debited first and credited back if the ring withdrawal fails.

## Privacy, precisely

| | Private | Visible on-chain |
| --- | --- | --- |
| Ring balance | amounts, assets, history | that the treasury uses the ring |
| Deposit | — | sender, treasury, amount |
| Merchant payment | the rest of the balance | payer → merchant, amount |
| Withdrawal | the rest of the balance | treasury → address, amount |

Merchants also see the delivery details (name, address) they need to fulfil an order. Privi never asks users to connect a wallet to prove token holdings.

## Accounts and sessions

- **Passkeys only** (`auth.ts`, WebAuthn via SimpleWebAuthn). No email or password.
- **Sign-in tokens.** The browser cookie holds a random token (`authsess:{token}` → account), issued fresh on every sign-in and registration and deleted on sign-out. The account's balance id never leaves the server. A cookie that names an owned balance without a live token is ignored.
- **One writer per account.** Money-changing requests run under a per-account Redis lock (`session.ts`) and reload state inside it.
- **Region gate.** Comprehensively sanctioned jurisdictions are refused for anything that moves money.

## The agent

- `agent/run.ts` streams a Claude turn, runs tools, and loops until the model is done. The transcript is stored per account and can be deleted by the user.
- `agent/tools.ts` defines every tool with a zod schema: wallet, product, flight and hotel search, prepare and confirm purchase, order status, cancel.
- `agent/system.ts` is the system prompt. Keep it byte-stable: it is cached.
- Hosted web search and fetch run on Anthropic's infrastructure, not Privi's servers.

## Limits and abuse protection (`limits.ts`, `kv.ts`)

Per-IP and per-account rate limits on sign-in, chat, funds and orders; a cap on concurrent agent turns; per-account and global daily model spend caps; exactly-once deposit crediting; capped, separate telemetry for browser error reports.

## Storage

Upstash Redis in production (required: ring wallet state and locks must be shared across serverless instances); in-memory in development. Keys are namespaced by purpose (`s:` sessions, `user:` accounts, `cred:` passkeys, `authsess:` sign-in tokens, `dep:` deposits, `lock:` locks, `rl:` rate limits).

## Merchant integrations

| Module | Provides |
| --- | --- |
| `zinc.ts` | Store orders at major US retailers, paid via x402, with tracking |
| `brij.ts` | Airline tickets and hotel stays, paid into escrow via x402 |
| `bitrefill.ts` | Gift cards |
| `merchants.ts` | Order lifecycle, fee, and simulated providers for demo mode |

Adding a merchant usually means a client module in `src/lib/privi/`, search and prepare tools in `agent/tools.ts`, a branch in `confirm_purchase`, and a settle/refresh function for status and refunds. See `CONTRIBUTING.md`.
