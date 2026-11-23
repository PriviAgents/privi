# Security

Privi holds user funds, so we take reports seriously and respond quickly.

## Reporting a vulnerability

**Please don't open a public issue.** Report privately, either way works:

1. **Report form:** [priviagents.com/bug-bounty](https://priviagents.com/bug-bounty#report). Use this if GitHub says you've reached its limit for creating advisories.
2. **GitHub:** the **Security** tab of this repository → **Report a vulnerability**.

Include what you found, the code path (file and line), how to reproduce it, and the impact you expect. If neither works, DM [@priviagents](https://x.com/priviagents) on X. We never ask for keys, seed phrases or funds, and we only share a contact address through these channels.

We'll acknowledge your report as quickly as we can and keep you updated until the issue is resolved. Please give us reasonable time to fix an issue before disclosing it, and never access, modify or move other users' data or funds while testing. Use your own account and small amounts.

## Bug bounty

A major security bug pays **$100 in USDC** (Round 02 is open; Round 1 closed with five bugs fixed). One payout per unique issue: the first complete report gets it, and we decide whether an issue is major based on its real impact on users' funds, accounts or privacy. Payouts are sent once the fix ships. Full rules: [priviagents.com/bug-bounty](https://priviagents.com/bug-bounty).

## In scope

- Authentication, sessions and passkeys
- The ledger, deposits, withdrawals and Privacy Ring custody
- Purchase approval (paying without the user's approval)
- Data exposure: balances, orders, shipping or traveller details
- The production site at priviagents.com

Out of scope: denial of service, rate-limit tuning, social engineering, and issues in third-party services we integrate with (report those to the provider).

## Audits

| Date | Auditor | Type | Report |
| --- | --- | --- | --- |
| 2026-11-22 | zauth Vector | Whitebox scan (source + live deployment) | [Findings and resolutions](https://priviagents.com/security-audit) · [PDF](public/security/zauth-vector-report-2026-11-22.pdf) · [Markdown](public/security/zauth-vector-report-2026-11-22.md) |

24 findings, none critical. Every finding that applied to Privi was fixed or mitigated the same day; each resolution is listed on the audit page and in [`src/lib/security-audit.ts`](src/lib/security-audit.ts).
