import type { Metadata } from "next";
import Image from "next/image";
import { ArrowDownToLine, FileText, Braces } from "lucide-react";
import { Nav } from "@/components/landing/Nav";
import { AUDIT, FINDINGS, statusCounts, type Severity, type Status } from "@/lib/security-audit";

export const metadata: Metadata = {
  title: "Security audit",
  description:
    "Privi's whitebox security scan by zauth Vector (November 22, 2026): the full report, every finding, and how each one was resolved.",
  alternates: {
    types: {
      "application/pdf": AUDIT.reportPdf,
      "text/markdown": AUDIT.reportMarkdown,
      "application/json": "/security-audit/findings.json",
    },
  },
};

const SEV_ORDER: Severity[] = ["HIGH", "MEDIUM", "LOW", "INFO"];

const sevCls: Record<Severity, string> = {
  HIGH: "bg-black text-white",
  MEDIUM: "border border-black/70 text-foreground",
  LOW: "bg-black/[0.06] text-foreground/80",
  INFO: "bg-black/[0.035] text-muted",
};

const statusCls: Record<Status, string> = {
  Fixed: "bg-ember text-white shadow-[0_2px_8px_-2px_rgba(232,65,37,0.45)]",
  Mitigated: "border border-ember/60 text-ember",
  "Not applicable": "bg-black/[0.05] text-muted",
  "False positive": "bg-black/[0.05] text-muted",
};

const date = (iso: string) => new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });

export default function SecurityAuditPage() {
  const counts = statusCounts();
  return (
    <main className="flex-1 overflow-x-clip">
      <Nav />
      <div className="relative mx-auto mt-6 max-w-6xl border-x border-t border-line bg-background px-4 pb-24 pt-10 sm:px-8 lg:pt-14">
        <article className="mx-auto max-w-[920px]">
          {/* Header */}
          <header className="border-b border-line pb-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#141210] py-1.5 pl-2 pr-3.5 text-[12.5px] text-white/80">
              <Image src="/brand/zauth.png" alt="" width={18} height={18} aria-hidden />
              Audited by zauth
            </div>
            <h1 className="mt-5 text-[38px] font-semibold leading-[1.05] tracking-tight sm:text-[48px]">Security audit</h1>
            <p className="mt-5 max-w-[680px] text-[16px] leading-relaxed text-muted">
              Privi&apos;s code and live deployment were scanned by{" "}
              <a href="https://zauth.inc/vector" target="_blank" rel="noreferrer" className="text-foreground underline decoration-black/20 underline-offset-4 hover:decoration-black">
                zauth Vector
              </a>
              , a whitebox security assessment that reads the source, traces untrusted input to sensitive operations, and proves exploitable
              paths against the running site. The full report is published below, unedited, along with how we resolved every finding.
            </p>

            <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
              <Stat label="Findings" value={String(FINDINGS.length)} hint="0 critical" />
              <Stat label="Fixed" value={String(counts.Fixed)} hint="shipped same day" accent />
              <Stat label="Mitigated" value={String(counts.Mitigated)} hint="see notes" />
              <Stat label="Not applicable" value={String(counts["False positive"] + counts["Not applicable"])} hint={`incl. ${counts["False positive"]} false positives`} />
            </dl>

            <dl className="mt-6 grid gap-x-8 gap-y-2 text-[13.5px] sm:grid-cols-2">
              <Meta k="Auditor" v={`${AUDIT.auditor} · ${AUDIT.product}`} />
              <Meta k="Assessment" v={AUDIT.mode} />
              <Meta k="Target" v={AUDIT.target} />
              <Meta k="Scan date" v={date(AUDIT.completed)} />
              <Meta k="Remediated" v={date(AUDIT.remediatedOn)} />
              <Meta k="Scan ID" v={AUDIT.scanId} mono />
            </dl>

            <div className="mt-8 flex flex-wrap gap-2">
              <a href={AUDIT.reportPdf} download className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-[13.5px] font-medium text-white transition-colors hover:bg-black/85">
                <ArrowDownToLine size={15} /> Download report (PDF)
              </a>
              <a href={AUDIT.reportMarkdown} className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-[13.5px] font-medium transition-colors hover:bg-black/[0.03]">
                <FileText size={15} /> Markdown
              </a>
              <a href="/security-audit/findings.json" className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-[13.5px] font-medium transition-colors hover:bg-black/[0.03]">
                <Braces size={15} /> JSON
              </a>
            </div>
          </header>

          {/* Resolutions */}
          <section id="findings" aria-labelledby="findings-h" className="scroll-mt-28 border-b border-line py-12">
            <h2 id="findings-h" className="text-[26px] font-semibold tracking-tight">Findings and resolutions</h2>
            <p className="mt-3 max-w-[680px] text-[15px] leading-relaxed text-muted">
              Every finding from the report, by severity. Some findings share a root cause and were fixed together.
            </p>
            {SEV_ORDER.map((sev) => {
              const rows = FINDINGS.filter((f) => f.severity === sev);
              return (
                <div key={sev} className="mt-8">
                  <h3 className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.14em] text-subtle">
                    {sev.charAt(0) + sev.slice(1).toLowerCase()} <span className="tabular text-foreground/40">· {rows.length}</span>
                  </h3>
                  <ol className="mt-3 overflow-hidden rounded-2xl border border-line bg-white/70">
                    {rows.map((f) => (
                      <li key={f.id} id={f.id.toLowerCase()} data-severity={f.severity} data-status={f.status} className="scroll-mt-28 border-t border-line px-4 py-4 first:border-t-0 sm:px-5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[11.5px] text-subtle">{f.id}</span>
                          <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${sevCls[f.severity]}`}>{f.severity}</span>
                          <span className="text-[11.5px] text-subtle">{f.category}</span>
                          <span className={`ml-auto whitespace-nowrap rounded-md px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] ${statusCls[f.status]}`}>{f.status}</span>
                        </div>
                        <h4 className="mt-2 text-[15px] font-medium leading-snug">{f.title}</h4>
                        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">{f.resolution}</p>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </section>

          {/* Report */}
          <section id="report" aria-labelledby="report-h" className="scroll-mt-28 pt-12">
            <h2 id="report-h" className="text-[26px] font-semibold tracking-tight">Full report</h2>
            <p className="mt-3 max-w-[680px] text-[15px] leading-relaxed text-muted">
              The original report as delivered by zauth, 164 pages. It describes the issues as found, before the fixes above.
            </p>
            <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-black/[0.03]">
              <iframe src={`${AUDIT.reportPdf}#view=FitH`} title="zauth Vector security report (PDF)" className="hidden h-[80vh] w-full md:block" />
              <div className="md:hidden">
                <FallbackLink />
              </div>
            </div>
          </section>
        </article>
      </div>
    </main>
  );
}

function FallbackLink() {
  return (
    <a href={AUDIT.reportPdf} className="flex items-center justify-between gap-3 px-5 py-4 text-[14px] font-medium">
      <span className="inline-flex items-center gap-2">
        <FileText size={16} /> Open the PDF report
      </span>
      <ArrowDownToLine size={15} className="text-subtle" />
    </a>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint: string; accent?: boolean }) {
  return (
    <div className="bg-background px-4 py-4">
      <dt className="text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">{label}</dt>
      <dd className={`tabular mt-1 text-[30px] font-semibold leading-none tracking-tight ${accent ? "text-ember" : ""}`}>{value}</dd>
      <dd className="mt-1.5 text-[12px] text-subtle">{hint}</dd>
    </div>
  );
}

function Meta({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2">
      <dt className="text-subtle">{k}</dt>
      <dd className={`truncate text-right text-foreground/85 ${mono ? "font-mono text-[12px]" : ""}`}>{v}</dd>
    </div>
  );
}
