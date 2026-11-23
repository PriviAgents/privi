import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Nav } from "@/components/landing/Nav";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/glass";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How Privi works: passkey accounts, SOL and USDC deposits, a private balance in a Helius Privacy Ring, and an agent that buys products, books flights and hotels, and pays only after you approve.",
};

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "quickstart", label: "Quickstart" },
  { id: "install", label: "Install on your phone" },
  { id: "accounts", label: "Accounts & passkeys" },
  { id: "deposits", label: "Deposits" },
  { id: "balance", label: "Your private balance" },
  { id: "agent", label: "What the agent can do" },
  { id: "products", label: "Products" },
  { id: "flights", label: "Flights" },
  { id: "hotels", label: "Hotels" },
  { id: "payment", label: "How payment works" },
  { id: "orders", label: "Orders & tracking" },
  { id: "withdrawals", label: "Withdrawals" },
  { id: "privacy", label: "What is private" },
  { id: "data", label: "Your data & deletion" },
  { id: "security", label: "Security" },
  { id: "fees", label: "Fees & regions" },
  { id: "faq", label: "FAQ" },
  { id: "glossary", label: "Glossary" },
] as const;

export default function DocsPage() {
  return (
    <main className="flex-1 overflow-x-clip">
      <Nav />
      <div className="relative mx-auto mt-6 grid max-w-6xl gap-10 border-x border-t border-line bg-background px-4 pb-24 pt-10 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-14 lg:pt-14">
        <aside className="lg:sticky lg:top-28 lg:h-[calc(100dvh-8rem)] lg:overflow-y-auto">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">Documentation</p>
          <nav aria-label="Docs sections" className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[13.5px] lg:flex-col lg:gap-y-2.5">
            {SECTIONS.map((s) => (
              <a key={s.id} href={`#${s.id}`} className="text-muted transition-colors hover:text-foreground">
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="docs min-w-0 max-w-[720px]">
          <header className="border-b border-line pb-8">
            <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-subtle">Privi docs</p>
            <h1 className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-[48px]">
              Private balance.
              <br />
              Agentic spending.
            </h1>
            <p className="mt-5 text-[16px] leading-relaxed text-muted">
              Privi keeps your SOL and USDC in a private balance on Solana, where amounts are encrypted on-chain. Tell the Privi agent what
              you need in plain language. It finds real options, shows you the exact price, and pays only after you approve.
            </p>
          </header>

          <Section id="overview" title="Overview">
            <p>Privi brings together three things:</p>
            <ul>
              <li>
                <strong>A private balance.</strong> Your SOL and USDC sit in a Helius Privacy Ring, where balances and transfer amounts are
                encrypted on Solana. Your holdings and spending history aren&apos;t readable on a block explorer.
              </li>
              <li>
                <strong>An agent that gets things done.</strong> It searches live inventory, compares options, and prepares the order. It never
                spends without your explicit approval.
              </li>
              <li>
                <strong>Real purchases.</strong> Products shipped to your door from major retailers, airline tickets, and hotel stays, paid
                straight from your private balance in seconds.
              </li>
            </ul>
          </Section>

          <Section id="quickstart" title="Quickstart">
            <ol>
              <li>
                Open <Link href="/app">the app</Link> and choose <strong>Create account</strong>. Your device creates a passkey (Face ID,
                Touch ID, Windows Hello or a security key). No email or password.
              </li>
              <li>
                In <strong>Funds → Deposit</strong>, choose SOL or USDC and an amount. Pay with your browser wallet, scan the QR code with your
                phone, or send the exact amount shown to the address.
              </li>
              <li>Solana confirms in seconds, and the deposit lands in your private balance automatically.</li>
              <li>
                Ask for something: <em>&ldquo;Noise-cancelling headphones under $200&rdquo;</em>, <em>&ldquo;Flights to Lisbon next
                Friday&rdquo;</em> or <em>&ldquo;A hotel in Paris for two nights.&rdquo;</em>
              </li>
              <li>Pick from the options, review the exact price, and approve.</li>
              <li>Follow everything on its order page: shipping and tracking, or your airline or hotel confirmation.</li>
            </ol>
          </Section>

          <Section id="install" title="Install on your phone">
            <p>
              Privi runs full screen from your home screen, like an app. No app store needed. In the app, tap <strong>Get the app</strong>,
              or:
            </p>
            <ul>
              <li>
                <strong>iPhone and iPad:</strong> open priviagents.com/app in Safari, tap <strong>Share</strong>, then{" "}
                <strong>Add to Home Screen</strong>.
              </li>
              <li>
                <strong>Android:</strong> open it in Chrome, tap the <strong>⋮</strong> menu, then <strong>Install app</strong> (or{" "}
                <strong>Add to Home screen</strong>).
              </li>
            </ul>
            <Note>
              On iPhone, the home screen app keeps its own sign-in, separate from Safari. Sign in once with your passkey inside the app; your
              balance and orders are the same.
            </Note>
          </Section>

          <Section id="accounts" title="Accounts & passkeys">
            <p>
              Privi accounts use passkeys. The private key never leaves your device or password manager; Privi stores only the public key, so
              there&apos;s no password to leak or phish.
            </p>
            <ul>
              <li>
                <strong>Create account</strong> links a new passkey to your balance.
              </li>
              <li>
                <strong>Signing in on another device</strong>: choose <em>I have a passkey</em>. Passkeys synced through iCloud Keychain,
                Google Password Manager or 1Password work across your devices, or scan a QR code with your phone.
              </li>
              <li>
                <strong>Sessions</strong> last 30 days. <em>Sign out</em> ends the session in that browser.
              </li>
              <li>Chat, deposits, purchases and withdrawals all require a signed-in session.</li>
            </ul>
            <Note>
              Your passkey is the only way into your account. Keep it in a synced password manager so a lost phone never means a lost
              balance.
            </Note>
          </Section>

          <Section id="deposits" title="Deposits">
            <p>Privi accepts SOL and USDC on Solana mainnet. Each deposit request stays open for 30 minutes and can be paid three ways:</p>
            <ul>
              <li>
                <strong>Pay with your wallet.</strong> Privi detects Phantom, Solflare, Backpack and other Solana wallets in your browser,
                prepares the exact transfer, and your wallet asks you to approve it.
              </li>
              <li>
                <strong>Scan the QR code</strong> with any Solana Pay wallet on your phone.
              </li>
              <li>
                <strong>Send manually.</strong> Copy the address and send <em>exactly</em> the amount shown. Each open deposit has its own
                exact amount, which is how a manual transfer is matched to your account.
              </li>
            </ul>
            <Table
              head={["", "SOL", "USDC"]}
              rows={[
                ["Minimum deposit", "0.01 SOL", "1 USDC"],
                ["Network", "Solana mainnet", "Solana mainnet"],
                ["Request window", "30 minutes", "30 minutes"],
              ]}
            />
            <Note>
              Send only SOL or USDC on Solana. If you send a different amount than requested, message{" "}
              <a href="https://x.com/priviagents">@priviagents</a> with the transaction signature and we&apos;ll match it for you.
            </Note>
          </Section>

          <Section id="balance" title="Your private balance">
            <p>
              The balance card shows your SOL and USDC and their total value in US dollars, using live market prices refreshed every few
              seconds.
            </p>
            <p>
              Funds sit in a <strong>Helius Privacy Ring</strong>: a shielded pool on Solana where balances are encrypted and every spend is
              authorized with a zero-knowledge proof. Privi manages the ring account on your behalf and keeps an exact record of what belongs
              to you.
            </p>
          </Section>

          <Section id="agent" title="What the agent can do">
            <Table
              head={["", "What you get"]}
              rows={[
                ["Products", "Ordered from Amazon, Walmart, Target, Best Buy and other major US retailers, shipped to your address"],
                ["Flights", "Real airline tickets, one-way or round trip, with your confirmation code in the app"],
                ["Hotels", "Rooms worldwide with refundability and any charges due at the hotel shown up front"],
                ["Research", "Live web search for anything else: prices, availability, comparisons"],
              ]}
            />
            <p>Every purchase follows the same two steps:</p>
            <ol>
              <li>
                <strong>Prepare.</strong> The agent picks the option, locks the price and shows you a summary. Nothing is charged.
              </li>
              <li>
                <strong>Approve.</strong> You reply with an explicit yes or tap <em>Approve</em>. Only then does Privi pay. You can decline any
                prepared order.
              </li>
            </ol>
          </Section>

          <Section id="products" title="Products">
            <ul>
              <li>Ask for what you want. The agent searches live store catalogs and shows current, in-stock listings with prices and links.</li>
              <li>
                The first time, it asks for your shipping address (name, street, city, state, ZIP and phone) and remembers it for next time.
              </li>
              <li>
                You approve an <strong>upper limit</strong> covering the item, tax and shipping. Whatever the final store total doesn&apos;t
                use comes back to your balance automatically.
              </li>
              <li>Orders ship to the United States. Each order can be up to $499.</li>
            </ul>
          </Section>

          <Section id="flights" title="Flights">
            <ul>
              <li>Give the route and dates. For round trips, choose your outbound flight, then your return, then confirm both.</li>
              <li>
                Each option shows the airline, times, stops and connections, fare type, checked bags, and whether it&apos;s refundable.
                Prices are all-in for every traveller.
              </li>
              <li>
                The agent then collects each traveller&apos;s details <strong>exactly as on their ID</strong>: name, date of birth, title,
                gender, email and phone. It reads the names back before you approve.
              </li>
              <li>The fare is held for about 15 minutes while you review.</li>
              <li>
                Payment is held in <strong>escrow</strong> and released only when the airline issues your ticket. If it isn&apos;t ticketed,
                it&apos;s returned to your balance in full.
              </li>
              <li>Your airline confirmation code appears on the order page; use it with your last name to check in on the airline&apos;s site.</li>
            </ul>
            <Note>Basic fares are usually non-refundable and can&apos;t be changed. The agent says so before you approve.</Note>
          </Section>

          <Section id="hotels" title="Hotels">
            <ul>
              <li>Give the city, dates and number of guests. You&apos;ll see hotels with photos, ratings and all-in prices for the stay.</li>
              <li>Open a hotel to see its rooms and rates: meal plan, cancellation terms, and anything payable at the hotel (such as city tax).</li>
              <li>Book with the lead guest&apos;s name, email and phone. Payment is held in escrow until the hotel confirms.</li>
              <li>Your hotel confirmation appears on the order page and in the lead guest&apos;s email.</li>
            </ul>
          </Section>

          <Section id="payment" title="How payment works">
            <ul>
              <li>
                <strong>USDC first.</strong> If your USDC covers the price, the purchase is paid in USDC.
              </li>
              <li>
                <strong>Otherwise SOL</strong>, converted at the live market rate when you pay. You approve the most SOL it can cost.
              </li>
              <li>
                <strong>A 2% Privi fee</strong> is added on top of the merchant price and shown before you approve (see{" "}
                <a href="#privi-fee">Fees</a>).
              </li>
              <li>The amount leaves your private balance only when you approve; the rest of your balance stays encrypted.</li>
              <li>Refunds (unused order budget, a fare that wasn&apos;t ticketed) come back to your balance in USDC.</li>
            </ul>
          </Section>

          <Section id="orders" title="Orders & tracking">
            <p>Every order has its own page, opened from <strong>Orders</strong> in the app. It updates live until the order is complete.</p>
            <ul>
              <li>
                <strong>Products:</strong> status from placed to shipped to delivered, estimated delivery date, carrier tracking, and the
                store&apos;s order number.
              </li>
              <li>
                <strong>Flights and hotels:</strong> your confirmation code, itinerary and travellers.
              </li>
              <li>
                <strong>Every order:</strong> what you paid, any amount returned to your balance, and links to the on-chain transactions.
              </li>
            </ul>
            <p>You can also just ask the agent, for example &ldquo;where&apos;s my order?&rdquo;</p>
          </Section>

          <Section id="withdrawals" title="Withdrawals">
            <p>
              In <strong>Funds → Withdraw</strong>, choose SOL or USDC, an amount and any Solana address. The funds leave the ring with a
              zero-knowledge withdrawal and usually arrive within seconds.
            </p>
            <p>A withdrawal reveals its own amount and destination on-chain, like any payment out of the ring.</p>
          </Section>

          <Section id="privacy" title="What is private">
            <p>Privacy Rings encrypt balances and amounts. Here is exactly what can and can&apos;t be seen on-chain:</p>
            <Table
              head={["", "Visible on-chain?"]}
              rows={[
                ["Your private balance", "No: encrypted in the ring"],
                ["Your spending history", "No"],
                ["Which account a payment came from", "No: payments come from the shared ring"],
                ["A deposit into Privi", "Yes: your wallet, Privi's address and the amount"],
                ["A payment to a merchant", "Yes: that payment's amount and destination"],
                ["A withdrawal", "Yes: its amount and destination"],
              ]}
            />
            <p>
              Privi can see your account&apos;s balance, orders and conversations so it can run the service; messages are processed by our AI
              model provider to generate replies. Merchants receive only what they need to fulfil an order, such as a shipping address or a
              traveller&apos;s name, and nothing about your balance.
            </p>
          </Section>

          <Section id="data" title="Your data & deletion">
            <p>What Privi keeps, and why:</p>
            <Table
              head={["", "Kept for"]}
              rows={[
                ["Balance and transaction ledger", "As long as you have an account: it's the record of your money"],
                ["Orders, shipping address and traveller details", "To fulfil, track and support your purchases"],
                ["Conversations with the agent", "Up to 30 days of inactivity, or until you delete them"],
                ["Sign-in", "Only your passkey's public key; no email or password"],
                ["Error reports", "Technical details (browser, page, error), not your messages"],
              ]}
            />
            <p>
              <strong>Delete chat history.</strong> In the app, choose <em>Delete chat</em> at the top of the page. Your conversations are
              erased from Privi immediately and the agent starts fresh; your balance and orders aren&apos;t affected. Messages you sent were
              processed by our AI model provider to generate replies, which may keep request data for a limited period under its own policy.
            </p>
            <p>
              To delete your account entirely, withdraw your balance and message <a href="https://x.com/priviagents">@priviagents</a>.
            </p>
          </Section>

          <Section id="security" title="Security">
            <ul>
              <li>
                <strong>Custody.</strong> Privi holds funds on your behalf in a ring account it operates, and keeps an exact ledger of what is
                yours.
              </li>
              <li>
                <strong>Sign-in.</strong> Passkeys only. Every money-moving action requires a signed-in session.
              </li>
              <li>
                <strong>Spending.</strong> Nothing is paid without your explicit approval, and never more than the amount you approved.
              </li>
              <li>
                <strong>Deposits</strong> are credited exactly once per Solana transaction.
              </li>
              <li>
                <strong>Abuse protection.</strong> Rate limits on sign-in, chat, purchases and withdrawals.
              </li>
            </ul>
            <h3 id="security-audit" className="mt-8 scroll-mt-28 text-[17px] font-semibold tracking-tight text-foreground">Security audit</h3>
            <p className="mt-2">
              Privi&apos;s source code and live site were assessed by zauth Vector, a whitebox security scan, on November 22, 2026. Every finding
              that applied to Privi was fixed or mitigated the same day. The full report, every finding and how each was resolved are
              published on the <Link href="/security-audit">security audit page</Link>, with the report also available as{" "}
              <a href="/security/zauth-vector-report-2026-11-22.pdf">PDF</a> and <a href="/security/zauth-vector-report-2026-11-22.md">Markdown</a>.
            </p>
            <h3 id="bug-bounty" className="mt-8 scroll-mt-28 text-[17px] font-semibold tracking-tight text-foreground">Bug bounty</h3>
            <p className="mt-2">
              Found a security bug? Report it privately on the <Link href="/bug-bounty">bug bounty page</Link>. A major bug pays $100 in USDC.
              Please don&apos;t post security issues publicly.
            </p>
          </Section>

          <Section id="fees" title="Fees & regions">
            <Table
              head={["", ""]}
              rows={[
                ["Account and balance", "Free"],
                ["Privi fee", "2% on top of every purchase, shown before you approve"],
                ["Merchant and booking fees", "Included in the merchant price, shown before you approve"],
                ["Network fees", "Covered for ring transfers; your wallet pays the normal Solana fee on deposits"],
                ["Withdrawals", "Up to 5 per hour"],
              ]}
            />
            <h3 id="privi-fee" className="mt-8 scroll-mt-28 text-[17px] font-semibold tracking-tight text-foreground">The 2% Privi fee</h3>
            <p className="mt-2">
              Privi adds a 2% service fee on top of the merchant price of every purchase: products, flights and hotels. Search results show
              the merchant price; the confirmation shows the item price, the 2% fee and the total before you approve, and the receipt
              lists the fee separately.
            </p>
            <ul>
              <li>
                <strong>Example.</strong> A $200.00 hotel stay costs $204.00: $200.00 to the hotel and $4.00 Privi fee.
              </li>
              <li>
                <strong>Paid in the same asset</strong> as the purchase (USDC, or SOL at the live rate), from your private balance.
              </li>
              <li>
                <strong>Refunded with the order.</strong> If a purchase fails or a fare isn&apos;t ticketed, the fee comes back with it. For store
                orders, the share of the fee on any unused budget is refunded too.
              </li>
              <li>
                <strong>Counts toward rewards.</strong> Spending through Privi qualifies for the $PRIVI top-spender airdrop. See{" "}
                <Link href="/tokenomics">Tokenomics</Link>.
              </li>
            </ul>
            <p>
              Privi isn&apos;t available in comprehensively sanctioned jurisdictions (Cuba, Iran, North Korea, Syria) or in Russian-occupied
              regions of Ukraine. Product orders ship within the United States.
            </p>
          </Section>

          <Section id="faq" title="FAQ">
            <Faq q="Can the agent spend without asking me?">
              No. Every purchase needs your explicit approval after you&apos;ve seen the price, and Privi never pays more than you approved.
            </Faq>
            <Faq q="My deposit hasn't shown up.">
              Keep the app open; deposits are credited within seconds of confirming on Solana. If you sent a different amount than requested,
              message @priviagents with the transaction signature.
            </Faq>
            <Faq q="What if a flight or hotel can't be booked?">
              Your payment sits in escrow until the booking is confirmed. If it isn&apos;t, the full amount returns to your balance
              automatically.
            </Faq>
            <Faq q="Can I return a product?">
              Returns follow the store&apos;s policy. Message @priviagents with your order number and we&apos;ll help.
            </Faq>
            <Faq q="Does Privi know what I buy?">
              Yes. Privi keeps your orders to fulfil and support them. What Privi protects is your balance and history from the public chain.
            </Faq>
            <Faq q="What if I lose my device?">
              Sign in with the same passkey from another device where it&apos;s synced. Use a synced password manager so your passkey is never
              stored on a single device.
            </Faq>
          </Section>

          <Section id="glossary" title="Glossary">
            <dl>
              <Term t="Privacy Ring">A shielded pool on Solana, built by Helius. Balances and amounts inside it are encrypted.</Term>
              <Term t="Zero-knowledge proof">
                A proof that a payment is valid (enough funds, correct owner) without revealing the balance behind it.
              </Term>
              <Term t="Passkey">A credential stored on your device that replaces passwords, unlocked with biometrics or a PIN.</Term>
              <Term t="Escrow">Funds held for one booking and released only when it&apos;s confirmed; returned in full otherwise.</Term>
              <Term t="Solana Pay">A standard payment request (address, amount, token) that Solana wallets understand.</Term>
            </dl>
          </Section>

          <div className="mt-16 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-glass)] border border-line bg-black/[0.02] p-6">
            <div>
              <p className="text-[17px] font-semibold tracking-tight">Ready to try it?</p>
              <p className="mt-1 text-[14px] text-muted">Create a passkey and make your first deposit in under a minute.</p>
            </div>
            <Link href="/app">
              <Button>
                Open app <ArrowRight size={14} />
              </Button>
            </Link>
          </div>
        </article>
      </div>
      <footer className="relative border-t border-line bg-background px-6 py-8 text-[13px] text-subtle sm:px-10">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Logo withText />
          <span>
            <a href="https://x.com/priviagents" target="_blank" rel="noreferrer" className="hover:text-foreground">
              @priviagents
            </a>
          </span>
        </div>
      </footer>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-b border-line py-10 last:border-b-0">
      <h2 className="text-[24px] font-semibold tracking-tight">
        <a href={`#${id}`} className="hover:underline hover:decoration-black/20 hover:underline-offset-4">
          {title}
        </a>
      </h2>
      <div className="docs-body mt-4">{children}</div>
    </section>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="my-5 rounded-xl border border-line bg-black/[0.025] px-4 py-3 text-[14px] leading-relaxed text-foreground/85">{children}</div>;
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  const showHead = head.some(Boolean);
  return (
    <div className="my-5 overflow-x-auto rounded-xl border border-line">
      <table className="w-full bg-background text-left text-[14px]">
        {showHead && (
          <thead className="bg-black/[0.025] text-[12px] uppercase tracking-[0.08em] text-subtle">
            <tr>
              {head.map((h, i) => (
                <th key={i} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-line first:border-t-0">
              {r.map((c, j) => (
                <td key={j} className={`px-4 py-2.5 align-top ${j === 0 ? "font-medium" : "text-muted"}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group border-b border-line py-4 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium">
        {q}
        <span className="text-subtle transition-transform group-open:rotate-45" aria-hidden>+</span>
      </summary>
      <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{children}</p>
    </details>
  );
}

function Term({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line py-3 last:border-b-0">
      <dt className="text-[15px] font-medium">{t}</dt>
      <dd className="mt-1 text-[14.5px] leading-relaxed text-muted">{children}</dd>
    </div>
  );
}
