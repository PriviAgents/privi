import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { siX } from "simple-icons";
import { Button } from "@/components/ui/glass";
import { Logo } from "@/components/ui/logo";
import { Nav } from "@/components/landing/Nav";
import { PrivacyReveal } from "@/components/landing/PrivacyReveal";
import { FAQ } from "@/components/landing/FAQ";
import { ApproveChip, CipherBalance, OnePayment } from "@/components/landing/PrivacyVisuals";
import { AskVisual, DepositVisual, SpendVisual } from "@/components/landing/StepVisuals";
import { LiveGrid } from "@/components/ui/LiveGrid";
import { HeroChat } from "@/components/landing/HeroChat";
import { BrandMarquee } from "@/components/landing/BrandMarquee";
import { Showcase } from "@/components/landing/Showcase";

export default function Landing() {
  return (
    <main className="flex-1 overflow-x-clip">
      <Nav />
      <HeroChat />

      {/* Below the hero everything sits on a solid background, so the site
          grid stops at the hero's edge. Sections live in a hairline frame. */}
      <div className="relative bg-background">
        <BrandMarquee />
      </div>

      <PrivacyReveal />

      <div className="relative bg-background">
        <div className="frame mx-auto max-w-6xl border-x border-line">
          <SectionMark label="How it works" id="flow" />
          <Flow />

          <SectionMark label="Where & what" id="rails" />
          <Showcase />

          <SectionMark label="Private by design" id="privacy" />
          <Privacy />

          <SectionMark label="FAQ" id="faq" />
          <FAQ />
        </div>

        <GetStarted />

        <div className="frame mx-auto max-w-6xl border-x border-line">
          <Footer />
        </div>
      </div>
    </main>
  );
}

/** Mono section marker with a full-bleed rule above and below, like a blueprint index. */
function SectionMark({ label, id }: { label: string; id: string }) {
  return (
    <div id={id} className="bleed-rule flex h-14 items-center border-y border-line pr-6 sm:pr-10">
      <span className="-ml-px mr-6 h-4 w-0.5 shrink-0 bg-ember shadow-[0_0_10px_rgba(232,65,37,0.6)] sm:mr-10" aria-hidden />
      <span className="font-mono text-[11.5px] uppercase tracking-[0.12em] text-subtle">{label}</span>
    </div>
  );
}

function Flow() {
  const steps = [
    {
      n: "01",
      title: "Deposit",
      body: "Fund with SOL or USDC from any Solana wallet. It moves into a Helius Privacy Ring, where your balance and transfer amounts are encrypted on-chain.",
      visual: DepositVisual,
    },
    {
      n: "02",
      title: "Ask",
      body: "Tell your agent what you need in plain language. It searches, compares, and brings back the best options — never more than three.",
      visual: AskVisual,
    },
    {
      n: "03",
      title: "Spend",
      body: "Approve once. Exactly the price leaves the ring to the merchant in a single Solana transaction, and your confirmation arrives in chat.",
      visual: SpendVisual,
    },
  ];
  return (
    <section>
      <div className="px-6 py-12 sm:px-10">
        <h2 className="max-w-2xl text-[32px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[40px]">
          Encrypted at rest. Settled on Solana. Approved by you.
        </h2>
      </div>
      <div className="grid border-t border-line md:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.n}
            className={`panel p-8 sm:p-10 ${i < 2 ? "border-b border-line md:border-b-0 md:border-r" : ""}`}
          >
            <s.visual />
            <div className="mt-6 font-mono text-[12px] text-ember">{s.n}</div>
            <h3 className="mt-1.5 text-[22px] font-semibold tracking-tight">{s.title}</h3>
            <p className="mt-2 text-[14.5px] leading-[1.6] text-muted">{s.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Privacy() {
  const pillars = [
    {
      visual: CipherBalance,
      title: "Encrypted balances",
      body: "Your SOL and USDC sit in a Helius Privacy Ring. Balances and amounts are protected by zero-knowledge proofs, so explorers and analytics firms can't read what you hold.",
    },
    {
      visual: OnePayment,
      title: "One payment, nothing more",
      body: "Each purchase reveals only itself. The merchant sees one payment, not your balance, your history, or what you bought anywhere else.",
    },
    {
      visual: ApproveChip,
      title: "An agent that works for you",
      body: "It searches, compares and confirms the order, then waits for your word before anything leaves your balance.",
    },
  ];
  return (
    <section>
      <div className="grid md:grid-cols-[1.2fr_0.8fr]">
        <div className="px-6 py-12 sm:px-10">
          <h2 className="max-w-xl text-[32px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[44px]">
            Buy what you want. Reveal only the payment.
          </h2>
        </div>
        <div className="flex items-end border-t border-line px-6 py-12 sm:px-10 md:border-l md:border-t-0">
          <p className="text-[15px] leading-[1.65] text-muted">
            On a public chain, every wallet is an open book. Privi keeps your
            balance encrypted in a Privacy Ring and hands the errands to an agent,
            so a merchant learns about one payment and where to send the order.
          </p>
        </div>
      </div>
      <div className="grid border-t border-line md:grid-cols-3">
        {pillars.map((p, i) => (
          <div
            key={p.title}
            className={`panel p-8 sm:p-10 ${i < 2 ? "border-b border-line md:border-b-0 md:border-r" : ""}`}
          >
            <p.visual />
            <h3 className="mt-6 text-[17px] font-semibold tracking-tight">{p.title}</h3>
            <p className="mt-2 text-[13.5px] leading-[1.6] text-muted">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Full-width closing call to action on the animated grid. */
function GetStarted() {
  return (
    <section id="start" className="relative overflow-hidden border-y border-line">
      <LiveGrid />
      <div className="relative mx-auto flex max-w-2xl flex-col items-center px-6 py-28 text-center sm:py-36">
        <h2 className="text-[36px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[56px]">
          Ready to get started?
        </h2>
        <p className="mt-4 max-w-md text-[16px] leading-[1.6] text-muted">
          Start for free. No account, no card — just a private balance and an
          agent that spends it on your terms.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/app">
            <Button size="lg">
              Open app <ArrowRight size={16} />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="flex flex-wrap items-center justify-between gap-4 px-6 py-8 text-[13px] text-subtle sm:px-10">
      <Logo withText />
      <div className="flex items-center gap-6">
        <Link href="/docs" className="transition-colors hover:text-foreground">Docs</Link>
        <a href="https://www.helius.dev/privacy" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">Helius Privacy</a>
        <a href="https://solana.com" target="_blank" rel="noreferrer" className="transition-colors hover:text-foreground">Solana</a>
        <a
          href="https://x.com/priviagents"
          target="_blank"
          rel="noreferrer"
          aria-label="Privi on X (@priviagents)"
          className="-m-2 flex size-9 items-center justify-center rounded-xl text-foreground/70 transition-colors hover:bg-black/[0.05] hover:text-foreground"
        >
          <svg viewBox="0 0 24 24" width={15} height={15} fill="currentColor" aria-hidden>
            <path d={siX.path} />
          </svg>
        </a>
      </div>
      <span>© Privi</span>
    </footer>
  );
}
