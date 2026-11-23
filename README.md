<p align="center">
  <img src="public/brand/privi-mark.png" width="72" alt="Privi" />
</p>

<h1 align="center">Privi</h1>

<p align="center">
  A private balance on Solana, and an AI agent that spends it for you, only after you approve.
  <br />
  <a href="https://priviagents.com">priviagents.com</a> ·
  <a href="https://priviagents.com/docs">Docs</a> ·
  <a href="https://priviagents.com/security-audit">Security audit</a> ·
  <a href="https://priviagents.com/tokenomics">Tokenomics</a>
</p>

---

Privi keeps your SOL and USDC in a [Helius Solana Privacy Ring](https://www.helius.dev), where balances and transfer amounts are encrypted on-chain. You tell the Privi agent what you need in plain language: a product shipped to your door, a flight, a hotel. It finds real options, shows you the exact price, and pays from your private balance **only after you approve**.

This repository is the complete source of the production app at [priviagents.com](https://priviagents.com).

## Why the source is public

- **Verify, don't trust.** The code that holds the ledger, credits deposits, enforces approvals and signs you in is all here.
- **Audited in the open.** The [zauth Vector security assessment](https://priviagents.com/security-audit) is published unedited, with every finding and its fix. See [`SECURITY.md`](SECURITY.md).
- **Build with us.** New merchants, travel features and UI improvements are welcome. See [`CONTRIBUTING.md`](CONTRIBUTING.md).

## How it works

```
your wallet ──deposit (Solana Pay)──▶ treasury ──sweep──▶ Privacy Ring (encrypted)
                                                               │
                         agent, after you approve ─────────────┼──▶ merchant
                         you, on request          ─────────────┴──▶ any Solana address
```

1. **Sign in with a passkey.** No email, no password.
2. **Deposit SOL or USDC.** Each deposit carries a unique reference key, so it's credited to you exactly once.
3. **Ask the agent.** It searches live inventory and prepares an order with the exact price, including Privi's 2% fee.
4. **Approve.** Payment happens only after your own approving message, checked on the server.
5. **Track it.** Every order has a page with status, tracking and refunds.

**Trust model, plainly:** Privi is custodial today. One treasury holds the pooled ring balance, and a per-user ledger records what's yours. The ring hides balances and amounts on-chain; each payment out still reveals its own amount and destination. Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Run it locally

Requirements: Node 20+ and an [Anthropic API key](https://platform.claude.com).

```bash
git clone https://github.com/PriviAgents/privi.git
cd privi
npm install
cp .env.example .env.local     # set ANTHROPIC_API_KEY
npm run dev                    # http://localhost:3000
```

The landing page's background video isn't included in this repository; the page works without it.

With only `ANTHROPIC_API_KEY` set, Privi runs in **demo mode**: an in-memory store, a test balance with a faucet, and simulated merchants. No real money moves and no other accounts are needed. Live mode (Privacy Rings, Redis and the merchant integrations) is configured with the variables in [`.env.example`](.env.example).

```bash
npm run lint          # ESLint
npx tsc --noEmit      # type check
npm run build         # production build
```

## Project structure

```
src/
├─ app/                     Next.js App Router
│  ├─ page.tsx              landing page
│  ├─ app/                  the signed-in app (chat, balance, orders)
│  ├─ docs/                 public documentation
│  ├─ security-audit/       audit report and resolutions (+ findings.json)
│  ├─ tokenomics/           $PRIVI token fee split
│  └─ api/                  route handlers: auth, chat, funds, orders, state, prices, telemetry, admin
├─ components/
│  ├─ app/                  app UI: chat, tool cards, wallet, orders
│  ├─ landing/              landing page sections
│  └─ ui/                   shared glass primitives, logo, backgrounds
└─ lib/
   ├─ agent/                Claude agent: system prompt, tools, streaming loop
   ├─ privi/                server core: ledger, deposits, rings, auth, sessions, merchants, limits
   └─ client/               browser helpers: formatting, markdown, error reporting
public/security/            the full audit report (PDF + Markdown)
scripts/new-treasury.mjs    generate a treasury key into .env.local without printing it
```

The files most worth reading first:

| File | What it does |
| --- | --- |
| [`src/lib/privi/wallet.ts`](src/lib/privi/wallet.ts) | Per-user ledger over the pooled ring balance |
| [`src/lib/privi/funds.ts`](src/lib/privi/funds.ts) | Deposits (reference keys, exactly-once crediting) and withdrawals |
| [`src/lib/privi/rings.ts`](src/lib/privi/rings.ts) | Privacy Ring treasury: sweeps and payments |
| [`src/lib/privi/auth.ts`](src/lib/privi/auth.ts) | Passkey accounts and rotating sign-in tokens |
| [`src/lib/privi/session.ts`](src/lib/privi/session.ts) | Session resolution, sign-in gate, per-account locks |
| [`src/lib/agent/tools.ts`](src/lib/agent/tools.ts) | Everything the agent can do, and the server-side approval check |
| [`src/lib/privi/merchants.ts`](src/lib/privi/merchants.ts) | Order lifecycle and the 2% fee |

## Built with

Next.js 16 · React · Tailwind CSS 4 · Claude (Anthropic SDK) · Helius Privacy Rings · Solana Kit · SimpleWebAuthn · Upstash Redis · x402

## License

[Business Source License 1.1](LICENSE). You may read, audit, modify and contribute, and run Privi for non-production use. Running a competing hosted service requires permission. On the Change Date each version converts to the Apache License 2.0.
