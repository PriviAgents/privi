# Contributing to Privi

Thanks for helping build Privi. Bug fixes, new merchants, travel and shopping features, UI polish and docs are all welcome.

## Getting set up

```bash
npm install
cp .env.example .env.local   # ANTHROPIC_API_KEY is enough for demo mode
npm run dev
```

Demo mode needs no Solana keys, Redis or merchant accounts: it uses an in-memory store, a test balance with a faucet, and simulated merchants. Please build and test features in demo mode. **Never test against real funds.**

Before opening a PR:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

> This project uses Next.js 16. Some APIs differ from older versions (for example, route `params` are a Promise). The bundled docs in `node_modules/next/dist/docs/` are the reference.

## Good places to start

- **New merchants and rails.** Add a client in `src/lib/privi/`, search/prepare tools in `src/lib/agent/tools.ts`, a branch in `confirm_purchase`, and a settle function for status and refunds. Follow the existing Zinc and BRIJ modules.
- **Agent tools.** Price alerts, watchlists, recurring purchases, better comparisons.
- **UI.** Tool cards (`src/components/app/ToolCard.tsx`), order pages, mobile polish, accessibility.
- **Docs.** `src/app/docs/page.tsx` and `docs/`.

Issues labelled `good first issue` are a good entry point.

## Areas that need extra care

Changes to these files get a stricter review, and should start with an issue describing the change:

- `src/lib/privi/wallet.ts`, `funds.ts`, `rings.ts`: ledger, deposits, withdrawals, custody
- `src/lib/privi/auth.ts`, `session.ts`: passkeys, sign-in tokens, locks
- `confirm_purchase` and the approval check in `src/lib/agent/tools.ts`
- `src/lib/privi/limits.ts`, rate limits and spend caps

Rules that apply everywhere:

- Money never moves without the server-side approval check.
- Every ledger change happens under the account lock, on state reloaded inside it.
- Never log, return or store secrets, full session tokens or payment details.
- Keep privacy claims accurate: Privacy Rings hide balances and amounts, not counterparties.

## Style

- TypeScript, strict. Validate external input with zod.
- Match the design system: white, black accents, glass surfaces, Geist; the orange accent sparingly.
- Small, focused PRs with a clear description. Include screenshots for UI changes.
- Write user-facing copy plainly: no jargon, no "demo" or placeholder language.

## Security issues

Please don't open public issues for vulnerabilities. See [`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under this repository's [license](LICENSE).
