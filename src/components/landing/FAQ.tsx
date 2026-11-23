"use client";

import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { siX } from "simple-icons";

/**
 * FAQ accordion. One answer open at a time; the panel animates its height via
 * grid rows (0fr → 1fr) so no measuring is needed, and the plus turns into an
 * ember ×. Fully keyboard accessible (buttons + aria-expanded/controls).
 */
const QA: { q: string; a: string }[] = [
  {
    q: "What is a Helius Privacy Ring?",
    a: "A shielded pool on Solana. Balances inside it are encrypted, and every spend is authorised with a zero-knowledge proof, so explorers and analytics firms can't read what you hold or what you've bought.",
  },
  {
    q: "What can my agent buy?",
    a: "Gift cards from hundreds of brands, real orders from Amazon, Walmart, Target and Best Buy, and flights and hotels. Each is paid in USDC or SOL straight from your private balance.",
  },
  {
    q: "Will the agent ever spend without asking?",
    a: "No. Every purchase is prepared first with an exact price, and nothing is paid until you reply with an explicit yes. You can cancel any prepared order.",
  },
  {
    q: "What do merchants and the public chain see?",
    a: "A merchant sees one payment: its amount and where it came from, the shared ring. Your balance, your history and which account paid stay private. Deposits into Privi and withdrawals out are visible on-chain, like any Solana transfer.",
  },
  {
    q: "How do I add or withdraw funds?",
    a: "Send SOL or USDC on Solana from Phantom, Solflare, Backpack or any Solana Pay wallet, and it moves into the ring once confirmed. Withdraw to any Solana address at any time; it usually lands in seconds.",
  },
  {
    q: "Are there fees or limits?",
    a: "Privi adds a 2% fee on top of each purchase. You see the item price, the fee and the total before you approve, and network fees for ring transfers are covered. For store orders you approve an upper limit, and whatever the final total doesn't use comes back to your balance.",
  },
  {
    q: "Who holds my funds?",
    a: "Privi is custodial: Privi operates the ring account and keeps a ledger of what's yours. You sign in with a passkey (no password to leak), and money only moves after you approve it.",
  },
];

export function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  const base = useId();

  return (
    <section className="grid md:grid-cols-[0.8fr_1.2fr]">
      <div className="border-b border-line px-6 py-12 sm:px-10 md:border-b-0 md:border-r">
        <h2 className="text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[40px]">
          FAQ
        </h2>
        <p className="mt-4 max-w-xs text-[14.5px] leading-[1.6] text-muted">
          Anything else? Ask us on X and we&apos;ll get back to you.
        </p>
        <a
          href="https://x.com/priviagents"
          target="_blank"
          rel="noreferrer"
          aria-label="Ask us on X (@priviagents)"
          className="faq-ask mt-6 inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-white/70 px-4 text-[13.5px] font-medium"
        >
          <svg viewBox="0 0 24 24" width={13} height={13} fill="currentColor" aria-hidden>
            <path d={siX.path} />
          </svg>
          Ask Us!
        </a>
      </div>

      <ul className="divide-y divide-line">
        {QA.map((item, i) => {
          const isOpen = open === i;
          const btn = `${base}-q${i}`;
          const panel = `${base}-a${i}`;
          return (
            <li key={item.q} className="faq-item" data-open={isOpen || undefined}>
              <h3>
                <button
                  id={btn}
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={panel}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="faq-q flex w-full items-center gap-4 px-6 py-5 text-left sm:px-10"
                >
                  <span className="flex-1 text-[16px] font-medium tracking-tight sm:text-[17px]">{item.q}</span>
                  <span className="faq-icon flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong">
                    <Plus size={15} />
                  </span>
                </button>
              </h3>
              <div id={panel} role="region" aria-labelledby={btn} className="faq-a">
                <div className="overflow-hidden">
                  <p className="faq-a-text px-6 pb-6 pr-16 text-[14.5px] leading-[1.65] text-muted sm:px-10 sm:pr-20">
                    {item.a}
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
