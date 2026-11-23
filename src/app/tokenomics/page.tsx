import type { Metadata } from "next";
import Link from "next/link";
import { Nav } from "@/components/landing/Nav";
import { CopyAddress } from "./CopyAddress";
import "./tokenomics.css";

export const metadata: Metadata = {
  title: "Tokenomics",
  description:
    "How $PRIVI token fees are used: 25% buyback and burn, 25% added to liquidity, 30% airdropped to Privi's top spenders, 20% development and operations.",
};

/** $PRIVI token details. Fill in when public; empty fields are hidden. */
const TOKEN = {
  symbol: "$PRIVI",
  chain: "Solana",
  contractAddress: "89DKn95R7QvjAcGSeqHvmj3pq7TJFbJcckURqjvuHsHp",
};

/** How fees from $PRIVI trading are split. Must add up to 100. */
const SPLIT = [
  { key: "burn", label: "Buyback & burn", pct: 25, color: "#0a0a0a", text: "Bought back on the open market and permanently burned, reducing supply." },
  { key: "lp", label: "Liquidity", pct: 25, color: "#5c5c5c", text: "Added to the $PRIVI liquidity pool for deeper markets and lower slippage." },
  { key: "airdrop", label: "Top-spender airdrop", pct: 30, color: "#e84125", text: "Airdropped to the people who spend the most through Privi." },
  { key: "ops", label: "Development & operations", pct: 20, color: "#c9c9c9", text: "Funds building and running Privi." },
] as const;

export default function TokenomicsPage() {
  return (
    <main className="flex-1 overflow-x-clip">
      <Nav />
      <div className="relative mx-auto mt-6 max-w-6xl border-x border-t border-line bg-background px-4 pb-24 pt-10 sm:px-8 lg:pt-14">
        <article className="mx-auto max-w-[860px]">
          <header className="border-b border-line pb-10">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-subtle">Tokenomics</p>
            <h1 className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-[52px]">
              {TOKEN.symbol}
              <span className="text-subtle">, built on usage.</span>
            </h1>
            <p className="mt-5 max-w-[640px] text-[16px] leading-relaxed text-muted">
              Fees from {TOKEN.symbol} trading go back into the token and to the people who actually use Privi. Every split is fixed and
              published here.
            </p>
            {TOKEN.contractAddress && (
              <div className="mt-7">
                <CopyAddress address={TOKEN.contractAddress} label={`Contract address · ${TOKEN.chain}`} />
              </div>
            )}
          </header>

          {/* Fee split */}
          <section id="fee-split" aria-labelledby="split-h" className="scroll-mt-28 border-b border-line py-12">
            <h2 id="split-h" className="text-[26px] font-semibold tracking-tight">Token fee split</h2>
            <p className="mt-3 max-w-[640px] text-[15px] leading-relaxed text-muted">
              Every trading fee collected on {TOKEN.symbol} is split four ways:
            </p>

            <div className="donut mt-10 grid items-center gap-10 md:grid-cols-[260px_minmax(0,1fr)] md:gap-14">
              <Donut />
              <ol className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white/70">
                {SPLIT.map((s) => (
                  <li key={s.key} data-k={s.key} className="split-row flex items-start gap-4 px-5 py-4 transition-colors hover:bg-black/[0.02]">
                    <span className="mt-1.5 size-3 shrink-0 rounded-[4px]" style={{ background: s.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-medium">{s.label}</div>
                      <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">{s.text}</p>
                    </div>
                    <span className={`tabular shrink-0 text-[24px] font-semibold leading-none tracking-tight ${s.key === "airdrop" ? "text-ember" : ""}`}>
                      {s.pct}%
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Airdrop */}
          <section id="airdrop" aria-labelledby="airdrop-h" className="scroll-mt-28 border-b border-line py-12">
            <h2 id="airdrop-h" className="text-[26px] font-semibold tracking-tight">Top-spender airdrop</h2>
            <div className="docs-body mt-4 max-w-[680px]">
              <p>
                30% of token fees go into an airdrop pool for the people who spend the most through Privi. It rewards using the product, not
                just holding the token.
              </p>
              <ul>
                <li>
                  <strong>You don&apos;t need to hold {TOKEN.symbol}.</strong> Eligibility is based only on what you spend through Privi:
                  products, flights and hotels paid from your private balance.
                </li>
                <li>
                  <strong>Ranked by spend.</strong> Each month, the pool is split among the top spenders in proportion to what they spent.
                </li>
                <li>
                  <strong>No wallet linking.</strong> Privi never asks you to connect a wallet that holds the token, so your private balance is
                  never tied to a public address. Rewards go to a Solana address you choose, and it can be a brand-new one.
                </li>
                <li>
                  <strong>Fair by design.</strong> Rewards per dollar spent are kept well below Privi&apos;s 2% fee, so cycling money through
                  Privi to farm the airdrop always costs more than it earns.
                </li>
              </ul>
            </div>
          </section>

          {/* Platform fee */}
          <section id="platform-fee" aria-labelledby="fee-h" className="scroll-mt-28 py-12">
            <h2 id="fee-h" className="text-[26px] font-semibold tracking-tight">Platform fee</h2>
            <div className="docs-body mt-4 max-w-[680px]">
              <p>
                Separately from token fees, Privi adds a <strong>2% fee</strong> on top of every purchase. It&apos;s shown before you approve,
                included in the total you pay, and refunded with the order if a purchase fails. Every dollar you spend this way counts toward
                the top-spender airdrop.
              </p>
              <p>
                Details are in the <Link href="/docs#fees">docs</Link>.
              </p>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}

/** Ring chart of the split; segments draw in, and hovering a legend row highlights its segment. */
function Donut() {
  const r = 78;
  const c = 2 * Math.PI * r;
  const gap = 3;
  const starts = SPLIT.map((_, i) => SPLIT.slice(0, i).reduce((t, x) => t + (x.pct / 100) * c, 0));
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[260px]">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90" role="img" aria-label={SPLIT.map((s) => `${s.label} ${s.pct}%`).join(", ")}>
        <circle cx="100" cy="100" r={r} fill="none" stroke="rgba(0,0,0,0.04)" strokeWidth="22" />
        {SPLIT.map((s, i) => {
          const len = (s.pct / 100) * c;
          return (
            <circle
              key={s.key}
              data-k={s.key}
              className="donut-seg"
              cx="100"
              cy="100"
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth="22"
              strokeDasharray={`${len - gap} ${c - len + gap}`}
              strokeDashoffset={-starts[i]}
              style={{ animationDelay: `${i * 120}ms` }}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">Token fees</span>
        <span className="tabular mt-1 text-[34px] font-semibold leading-none tracking-tight">100%</span>
        <span className="mt-1.5 text-[12px] text-muted">allocated four ways</span>
      </div>
    </div>
  );
}
