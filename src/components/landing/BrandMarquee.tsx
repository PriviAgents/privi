import { BRANDS, type Brand } from "./brands";

/**
 * Monochrome merchant strip under the hero. Brands without a vector icon get
 * a typographic wordmark in the same ink.
 */
function BrandItem({ b }: { b: Brand }) {
  return (
    <li
      className="flex h-12 shrink-0 items-center gap-2.5 px-7 text-foreground/70 transition-colors duration-200 hover:text-foreground"
      title={b.name}
    >
      {b.icon ? (
        <svg viewBox="0 0 24 24" width={22} height={22} fill="currentColor" aria-hidden className="shrink-0">
          <path d={b.icon.path} />
        </svg>
      ) : null}
      <span
        className={
          b.wordmark
            ? b.wordmark === b.wordmark.toUpperCase()
              ? "text-[15px] font-bold tracking-[0.12em]"
              : "text-[19px] font-bold tracking-tight"
            : "text-[14px] font-medium tracking-tight"
        }
      >
        {b.wordmark ?? b.name}
      </span>
    </li>
  );
}

export function BrandMarquee() {
  const track = (ariaHidden: boolean) => (
    <ul className="marquee-track flex w-max items-center" aria-hidden={ariaHidden || undefined}>
      {BRANDS.map((b) => (
        <BrandItem key={b.name} b={b} />
      ))}
    </ul>
  );
  return (
    <section aria-label="Merchants available through Privi" className="border-y border-line py-8">
      <p className="mb-5 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-subtle">
        Buy from
      </p>
      <div className="marquee relative flex overflow-hidden">
        {track(false)}
        {track(true)}
      </div>
    </section>
  );
}
