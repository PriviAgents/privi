# Security

Privi holds user funds, so we take reports seriously and respond quickly.

## Reporting a vulnerability

**Please don't open a public issue.** Report privately through GitHub:

1. Go to the **Security** tab of this repository.
2. Click **Report a vulnerability**.

Include what you found, how to reproduce it, and the impact you expect. You can also reach us by DM on X at [@priviagents](https://x.com/priviagents) to ask for a contact.

We'll acknowledge your report as quickly as we can and keep you updated until the issue is resolved. Please give us reasonable time to fix an issue before disclosing it, and never access, modify or move other users' data or funds while testing. Use demo mode or your own account.

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
