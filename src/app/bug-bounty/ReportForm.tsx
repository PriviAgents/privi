"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

const AREAS = ["Auth & passkeys", "Balances, deposits & withdrawals", "Purchase approval", "Privacy / data exposure", "Other"];
const SEVERITIES = [
  { v: "critical", l: "Critical" },
  { v: "high", l: "High" },
  { v: "medium", l: "Medium" },
  { v: "low", l: "Low" },
];

const field = "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[16px] sm:text-[14px] outline-none transition-colors placeholder:text-subtle focus:border-black/30";
const label = "text-[12.5px] font-medium text-foreground";

export function ReportForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)]));
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/security-report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? "Couldn't send the report. Try again.");
      setDone(j.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-line bg-white p-6 sm:p-8">
        <span className="flex size-10 items-center justify-center rounded-full bg-ember text-white shadow-[0_6px_18px_-6px_rgba(232,65,37,0.7)]">
          <Check size={18} strokeWidth={3} />
        </span>
        <h3 className="mt-4 text-[20px] font-semibold tracking-tight">Report received</h3>
        <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
          Thanks. Your reference is <span className="font-mono text-foreground">{done}</span>. We read every report and will reach out through the contact you gave. Please keep the details private until
          we&apos;ve shipped a fix.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-line bg-white p-5 sm:p-8">
      <div className="space-y-1.5">
        <label htmlFor="r-title" className={label}>Title</label>
        <input id="r-title" name="title" required minLength={5} maxLength={200} placeholder="e.g. Withdrawal can be paid twice under a slow confirmation" className={field} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="r-sev" className={label}>Severity (your estimate)</label>
          <select id="r-sev" name="severity" defaultValue="high" className={field}>
            {SEVERITIES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="r-area" className={label}>Area</label>
          <select id="r-area" name="area" defaultValue={AREAS[0]} className={field}>
            {AREAS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="r-desc" className={label}>What you found and its impact</label>
        <textarea id="r-desc" name="description" required minLength={30} maxLength={20000} rows={6} placeholder="The vulnerable code path (file and line), what an attacker gains, and who is affected." className={`${field} resize-y`} />
      </div>
      <div className="space-y-1.5">
        <label htmlFor="r-steps" className={label}>Steps to reproduce / proof of concept</label>
        <textarea id="r-steps" name="steps" maxLength={20000} rows={6} placeholder="Numbered steps, a harness, or a link to a private gist. Use your own account only." className={`${field} resize-y font-mono text-[14px] sm:text-[12.5px]`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="r-contact" className={label}>How we reach you</label>
          <input id="r-contact" name="contact" required minLength={3} maxLength={200} placeholder="Email or X handle" className={field} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="r-payout" className={label}>
            USDC payout address <span className="font-normal text-subtle">(optional)</span>
          </label>
          <input id="r-payout" name="payout" maxLength={64} placeholder="Solana address" className={`${field} font-mono`} />
        </div>
      </div>
      {/* Honeypot for bots; hidden from people and screen readers. */}
      <div aria-hidden className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="r-website">Website</label>
        <input id="r-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="flex flex-col-reverse items-start gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] leading-relaxed text-subtle">Don&apos;t include other people&apos;s data, keys or funds. Reports are private and only seen by the Privi team.</p>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-xl bg-black px-5 text-[14px] font-medium text-white transition-colors hover:bg-black/85 disabled:opacity-60"
        >
          {busy && <Loader2 size={15} className="animate-spin" />}
          Send report
        </button>
      </div>
      {error && <p className="text-[13px] text-danger">{error}</p>}
    </form>
  );
}
