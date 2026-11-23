import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/landing/Nav";
import { ReportForm } from "./ReportForm";

export const metadata: Metadata = {
  title: "Bug bounty",
  description: "Report a major security bug in Privi and earn $100 in USDC. Scope, rules and a private report form.",
};

const IN_SCOPE = [
  { t: "Auth & passkeys", d: "Signing in as someone else, taking over an account or a balance." },
  { t: "Balances & funds", d: "Creating, moving or double-spending money: deposits, withdrawals, the ledger, the Privacy Ring." },
  { t: "Purchase approval", d: "Getting an order paid without the account holder's approval." },
  { t: "Privacy leaks", d: "Exposing balances, orders, shipping or traveller details to anyone else." },
];

const OUT_OF_SCOPE = [
  "Denial of service, load testing and rate-limit tuning",
  "Social engineering, phishing, physical attacks",
  "Bugs in third-party services we integrate with (report those to the provider)",
  "Missing best-practice headers or banners without a working exploit",
  "Anything found by touching other users' accounts, data or funds",
];

const RULES = [
  "One payout per unique issue: the first complete report of it gets the $100. Duplicates of a known or already-reported issue don't qualify.",
  "We decide whether a report is a major bug, based on real impact on users' funds, accounts or privacy.",
  "Test only with your own account and small amounts. Never access, change or move anyone else's data or funds.",
  "Keep it private until we've shipped a fix. We'll tell you when it's live.",
  "Payouts are in USDC on Solana, sent to the address you give us once the fix ships.",
];

export default function BugBountyPage() {
  return (
    <main className="flex-1 overflow-x-clip">
      <Nav />
      <div className="relative mx-auto mt-6 max-w-6xl border-x border-t border-line bg-background px-4 pb-24 pt-10 sm:px-8 lg:pt-14">
        <article className="mx-auto max-w-[920px]">
          <header className="border-b border-line pb-10">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-white/80 px-3.5 py-1.5 font-mono text-[11.5px] uppercase tracking-[0.14em] text-foreground/75">
              <i className="size-2 rounded-full bg-ember shadow-[0_0_0_4px_rgba(232,65,37,0.15)]" />
              Round 01 · Open
            </span>
            <h1 className="mt-5 text-[38px] font-semibold leading-[1.05] tracking-tight sm:text-[48px]">
              Bug bounty<span className="text-ember">.</span>
            </h1>
            <p className="mt-5 max-w-[680px] text-[16px] leading-relaxed text-muted">
              Privi holds real money, and{" "}
              <a href="https://github.com/PriviAgents/privi" target="_blank" rel="noreferrer" className="text-foreground underline decoration-black/20 underline-offset-4 hover:decoration-black">
                its code is open
              </a>
              . Find a major security bug and we&apos;ll pay you <strong className="font-semibold text-foreground">$100 in USDC</strong>. This is the first round; more are coming.
            </p>
            <dl className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
              <Stat label="Reward" value="$100" hint="per major bug" accent />
              <Stat label="Paid in" value="USDC" hint="on Solana" />
              <Stat label="Round" value="01" hint="more coming" />
            </dl>
          </header>

          <section className="grid gap-10 border-b border-line py-10 md:grid-cols-2">
            <div>
              <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-subtle">In scope</h2>
              <ul className="mt-4 space-y-4">
                {IN_SCOPE.map((x) => (
                  <li key={x.t}>
                    <p className="text-[15px] font-medium">{x.t}</p>
                    <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{x.d}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-[13.5px] text-muted">Target: the production site at priviagents.com and the code in the public repository.</p>
            </div>
            <div>
              <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-subtle">Out of scope</h2>
              <ul className="mt-4 space-y-2.5">
                {OUT_OF_SCOPE.map((x) => (
                  <li key={x} className="flex gap-2.5 text-[14px] leading-relaxed text-muted">
                    <span className="mt-[9px] size-1 shrink-0 rounded-full bg-black/30" />
                    {x}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section className="border-b border-line py-10">
            <h2 className="text-[13px] font-medium uppercase tracking-[0.14em] text-subtle">Rules</h2>
            <ol className="mt-4 space-y-3">
              {RULES.map((r, i) => (
                <li key={r} className="flex gap-3 text-[14.5px] leading-relaxed text-foreground/85">
                  <span className="font-mono text-[12.5px] leading-[1.7] text-ember">{String(i + 1).padStart(2, "0")}</span>
                  {r}
                </li>
              ))}
            </ol>
          </section>

          <section id="report" className="scroll-mt-24 pt-10">
            <h2 className="text-[26px] font-semibold tracking-tight">Report a vulnerability</h2>
            <p className="mt-2 max-w-[680px] text-[14.5px] leading-relaxed text-muted">
              Send it here, privately. You can also use{" "}
              <a href="https://github.com/PriviAgents/privi/security/advisories/new" target="_blank" rel="noreferrer" className="text-foreground underline decoration-black/20 underline-offset-4 hover:decoration-black">
                GitHub&apos;s private advisory form
              </a>
              ; if GitHub says you&apos;ve hit its advisory limit, this form works instead. Please don&apos;t open public issues for security bugs.
            </p>
            <div className="mt-6">
              <ReportForm />
            </div>
            <p className="mt-6 text-[13px] text-subtle">
              Past findings and fixes are on the{" "}
              <Link href="/security-audit" className="text-foreground underline decoration-black/20 underline-offset-4 hover:decoration-black">
                security audit page
              </Link>
              .
            </p>
          </section>
        </article>
      </div>
    </main>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className="bg-white px-5 py-4">
      <dt className="font-mono text-[11px] uppercase tracking-[0.14em] text-subtle">{label}</dt>
      <dd className={`mt-1.5 text-[30px] font-semibold leading-none tracking-tight ${accent ? "text-ember" : ""}`}>{value}</dd>
      <dd className="mt-1.5 text-[12.5px] text-muted">{hint}</dd>
    </div>
  );
}
