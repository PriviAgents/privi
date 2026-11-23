import { Check, Lock } from "lucide-react";
import { PriviMark } from "@/components/ui/logo";

/**
 * Small illustrated UIs for the "Private by design" pillars, in place of
 * icons. Static markup; motion is CSS (.pv-* in globals.css) and stops under
 * reduced motion.
 */

/** The dotted panel every illustrated visual sits in. */
export function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="pv-frame relative flex h-[176px] items-center justify-center overflow-hidden rounded-2xl border border-line">
      {children}
    </div>
  );
}

/** A balance whose number is ciphertext, with an ember scan passing over it. */
export function CipherBalance() {
  return (
    <Frame>
      <div className="w-[78%] rounded-xl border border-line bg-white/90 p-3.5 shadow-[0_10px_28px_-16px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-subtle">Balance</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-ember/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ember">
            <Lock size={9} strokeWidth={2.6} /> Encrypted
          </span>
        </div>
        <div className="pv-cipher mt-2 font-mono text-[15px] tracking-[0.06em]">8f3a·c21e·77b0</div>
        <div className="mt-1.5 flex gap-1">
          {[34, 22, 46, 18].map((w, i) => (
            <span key={i} className="h-1 rounded-full bg-black/[0.08]" style={{ width: w }} />
          ))}
        </div>
      </div>
    </Frame>
  );
}

/** The merchant's copy: one readable line, everything else redacted. */
export function OnePayment() {
  const hidden = [
    { k: "Balance", w: 54 },
    { k: "History", w: 72 },
    { k: "Other orders", w: 40 },
  ];
  return (
    <Frame>
      <div className="w-[78%] rounded-xl border border-line bg-white/90 px-3.5 py-3 shadow-[0_10px_28px_-16px_rgba(0,0,0,0.3)]">
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-subtle">Merchant sees</div>
        <div className="mt-2 flex items-center justify-between rounded-md bg-ember/[0.08] px-1.5 py-1 text-[11.5px]">
          <span className="flex items-center gap-1 font-medium">
            <Check size={11} strokeWidth={2.8} className="text-ember" /> Payment
          </span>
          <span className="tabular font-medium">286.00 USDC</span>
        </div>
        {hidden.map((r, i) => (
          <div key={r.k} className="mt-1.5 flex items-center justify-between px-1.5 text-[11px] text-subtle">
            <span>{r.k}</span>
            <span className="pv-redact h-2 rounded-sm bg-foreground/85" style={{ width: r.w, animationDelay: `${i * 0.25}s` }} />
          </div>
        ))}
      </div>
    </Frame>
  );
}

/** The agent asks; nothing moves until you approve. */
export function ApproveChip() {
  return (
    <Frame>
      <div className="w-[82%]">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-black">
            <PriviMark size={12} inverted />
          </span>
          <p className="rounded-2xl rounded-tl-md border border-line bg-white/90 px-2.5 py-1.5 text-[11.5px] leading-[1.45] shadow-[0_8px_22px_-16px_rgba(0,0,0,0.35)]">
            Nonstop to Nice · <span className="font-semibold">$286.00</span>. Pay?
          </p>
        </div>
        <div className="mt-2.5 flex gap-1.5 pl-7">
          <span className="pv-approve relative inline-flex h-7 items-center gap-1 rounded-lg bg-ember px-2.5 text-[11.5px] font-medium text-white">
            <Check size={11} strokeWidth={2.8} /> Approve
          </span>
          <span className="inline-flex h-7 items-center rounded-lg border border-line-strong bg-white/80 px-2.5 text-[11.5px] text-muted">
            Decline
          </span>
        </div>
      </div>
    </Frame>
  );
}
