"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, LogOut, RefreshCw } from "lucide-react";
import { GlassCard, Kicker } from "@/components/ui/glass";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { timeAgo, usd } from "@/lib/client/format";

type Point = { day: string; n: number };
interface Stats {
  at: string;
  users: number;
  sessions: number;
  series: Record<"signups" | "logins" | "chats" | "orders" | "deposits" | "passkeyFails", Point[]>;
  aiSpendTodayUsd: number;
  errors: { at: string; source: string; where: string; name?: string; message: string; path?: string; ua?: string; sid?: string }[];
  spend: { address: string; sol: number; usdc: number } | { error: string } | null;
  ring: { private: { SOL: number; USDC: number }; publicSol: number } | { error: string } | null;
}

const TOKEN_KEY = "privi:admin-token";
const sum = (p: Point[]) => p.reduce((a, x) => a + x.n, 0);
const last = (p: Point[]) => p[p.length - 1]?.n ?? 0;

function device(ua?: string) {
  if (!ua) return "";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : "Other";
  const app = /Instagram/.test(ua) ? " · Instagram app" : /FBAN|FBAV/.test(ua) ? " · Facebook app" : /Twitter/.test(ua) ? " · X app" : /; wv\)/.test(ua) ? " · in-app" : "";
  const br = /CriOS|Chrome\//.test(ua) && !/Edg/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Firefox/.test(ua) ? "Firefox" : "";
  return `${os}${br ? ` ${br}` : ""}${app}`;
}

/** Private ops dashboard: users, activity, spend, balances, and the live error log. */
export function AdminDashboard() {
  const [token, setToken] = useState("");
  const [input, setInput] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(TOKEN_KEY);
        if (saved) setToken(saved);
      } catch {
        /* storage unavailable */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const load = useCallback(async (t: string) => {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/stats", { headers: { authorization: `Bearer ${t}` }, cache: "no-store" });
      const j = await r.json();
      if (!r.ok) {
        setError(r.status === 401 ? "Wrong admin token." : (j.error ?? `Error ${r.status}`));
        if (r.status === 401) {
          setToken("");
          try {
            sessionStorage.removeItem(TOKEN_KEY);
          } catch {}
        }
        return;
      }
      setStats(j);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const t = setTimeout(() => void load(token), 0);
    const iv = setInterval(() => void load(token), 30_000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [token, load]);

  if (!token) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4">
        <GlassCard strong className="w-full max-w-[380px] p-6">
          <Logo />
          <h1 className="mt-4 text-[20px] font-semibold tracking-tight">Admin</h1>
          <form
            className="mt-4 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = input.trim();
              if (!t) return;
              try {
                sessionStorage.setItem(TOKEN_KEY, t);
              } catch {}
              setToken(t);
            }}
          >
            <input
              type="password"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Admin token"
              className="w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-black/30"
            />
            <Button className="w-full" type="submit">
              Open dashboard
            </Button>
          </form>
          {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}
        </GlassCard>
      </div>
    );
  }

  const s = stats;
  const spend = s?.spend && !("error" in s.spend) ? s.spend : null;
  const ring = s?.ring && !("error" in s.ring) ? s.ring : null;

  return (
    <div className="min-h-dvh px-3 pb-10 pt-3 sm:px-4">
      <header className="glass mx-auto flex h-13 max-w-[1200px] items-center justify-between rounded-2xl px-4">
        <div className="flex items-center gap-3">
          <Logo href="/admin" />
          <span className="text-[13px] text-muted">Admin</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-[12px] text-subtle sm:inline-flex">
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {s ? `Updated ${timeAgo(s.at)} · every 30s` : "Loading"}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              try {
                sessionStorage.removeItem(TOKEN_KEY);
              } catch {}
              setToken("");
              setStats(null);
            }}
          >
            <LogOut size={14} />
          </Button>
        </div>
      </header>

      <main className="mx-auto mt-4 max-w-[1200px] space-y-3">
        {error && <GlassCard className="p-4 text-[13px] text-danger">{error}</GlassCard>}
        {!s && !error && <GlassCard className="h-64 animate-pulse" />}
        {s && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Tile label="Accounts" value={s.users.toLocaleString()} sub={`${s.sessions.toLocaleString()} sessions (incl. signed out)`} />
              <Tile label="Signups today" value={String(last(s.series.signups))} sub={`${sum(s.series.signups)} in 14 days`} />
              <Tile label="Chats today" value={String(last(s.series.chats))} sub={`AI spend today ${usd(s.aiSpendTodayUsd)}`} />
              <Tile label="Orders today" value={String(last(s.series.orders))} sub={`${sum(s.series.orders)} in 14 days · ${sum(s.series.deposits)} deposits`} />
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <Chart title="Signups" points={s.series.signups} />
              <Chart title="Chat turns" points={s.series.chats} />
              <Chart title="Passkey failures" points={s.series.passkeyFails} warn />
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_320px]">
              <GlassCard className="p-5">
                <div className="flex items-center justify-between">
                  <Kicker>Errors</Kicker>
                  <span className="text-[12px] text-subtle">{s.errors.length} most recent</span>
                </div>
                {s.errors.length === 0 && <p className="mt-3 text-[13px] text-muted">No errors logged.</p>}
                <ul className="scroll-thin mt-3 max-h-[520px] divide-y divide-line overflow-y-auto">
                  {s.errors.map((e, i) => (
                    <li key={i} className="py-2.5 text-[12.5px]">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={12} className={e.source === "server" ? "text-danger" : "text-foreground/50"} />
                        <span className="font-medium">{e.where}</span>
                        <span className="text-subtle">{e.source}</span>
                        <span className="ml-auto text-subtle">{timeAgo(e.at)}</span>
                      </div>
                      <div className="mt-0.5 break-words pl-5 text-muted">
                        {e.name ? <span className="font-mono text-[11.5px]">{e.name}: </span> : null}
                        {e.message}
                      </div>
                      {(e.ua || e.sid || e.path) && (
                        <div className="mt-0.5 pl-5 text-[11.5px] text-subtle">
                          {[device(e.ua), e.path, e.sid ? `session ${e.sid}…` : ""].filter(Boolean).join(" · ")}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </GlassCard>

              <GlassCard className="h-fit p-5">
                <Kicker>Treasury</Kicker>
                <dl className="mt-3 space-y-2 text-[13px]">
                  <Row k="Ring SOL (private)" v={ring ? ring.private.SOL.toFixed(4) : "…"} />
                  <Row k="Ring USDC (private)" v={ring ? ring.private.USDC.toFixed(2) : "…"} />
                  <Row k="Fee reserve SOL" v={ring ? ring.publicSol.toFixed(4) : "…"} />
                </dl>
                <div className="mt-4 border-t border-line pt-3">
                  <Kicker>Spend wallet</Kicker>
                  <dl className="mt-3 space-y-2 text-[13px]">
                    <Row k="USDC float" v={spend ? spend.usdc.toFixed(2) : "…"} warn={spend ? spend.usdc < 2 : false} />
                    <Row k="SOL (gas)" v={spend ? spend.sol.toFixed(4) : "…"} />
                  </dl>
                  {spend && spend.usdc < 2 && <p className="mt-2 text-[12px] text-danger">Float is low: searches will start failing. Top up USDC.</p>}
                  {spend && <p className="mt-2 break-all font-mono text-[10.5px] text-subtle">{spend.address}</p>}
                </div>
              </GlassCard>
            </div>

            <SecurityReports token={token} />
          </>
        )}
      </main>
    </div>
  );
}

type Report = { id: string; at: string; title: string; severity: string; area: string; description: string; steps: string; contact: string; payout?: string; ipHash: string };

/** Reports from priviagents.com/bug-bounty, newest first. */
function SecurityReports({ token }: { token: string }) {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    const load = async () => {
      const r = await fetch("/api/admin/reports", { headers: { authorization: `Bearer ${token}` }, cache: "no-store" }).catch(() => null);
      if (live && r?.ok) setReports(((await r.json()) as { reports: Report[] }).reports);
    };
    void load();
    const iv = setInterval(() => void load(), 60_000);
    return () => {
      live = false;
      clearInterval(iv);
    };
  }, [token]);
  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between">
        <Kicker>Security reports</Kicker>
        <span className="text-[12px] text-subtle">{reports ? `${reports.length} received` : "Loading"}</span>
      </div>
      {reports?.length === 0 && <p className="mt-3 text-[13px] text-muted">No reports yet.</p>}
      <ul className="mt-3 divide-y divide-line">
        {reports?.map((r) => (
          <li key={r.id} className="py-2.5 text-[13px]">
            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full cursor-pointer items-center gap-2 text-left">
              <span className={`rounded-md px-1.5 py-0.5 font-mono text-[10.5px] uppercase ${r.severity === "critical" || r.severity === "high" ? "bg-ember text-white" : "bg-black/[0.06]"}`}>{r.severity}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{r.title}</span>
              <span className="shrink-0 text-[12px] text-subtle">{timeAgo(r.at)}</span>
            </button>
            {open === r.id && (
              <div className="mt-2 space-y-2 pl-1 text-[12.5px]">
                <p className="text-subtle">
                  {r.area} · from <span className="text-foreground">{r.contact}</span> · {r.id} · ip {r.ipHash}
                  {r.payout ? <> · payout <span className="break-all font-mono">{r.payout}</span></> : null}
                </p>
                <pre className="whitespace-pre-wrap break-words font-sans leading-relaxed text-foreground/85">{r.description}</pre>
                {r.steps && <pre className="whitespace-pre-wrap break-words rounded-xl bg-black/[0.04] p-3 font-mono text-[11.5px] leading-relaxed">{r.steps}</pre>}
              </div>
            )}
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <GlassCard className="p-4">
      <div className="text-[11px] uppercase tracking-[0.12em] text-subtle">{label}</div>
      <div className="tabular mt-1 text-[28px] font-semibold tracking-tight">{value}</div>
      <div className="mt-0.5 text-[12px] text-muted">{sub}</div>
    </GlassCard>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className={`tabular font-medium ${warn ? "text-danger" : ""}`}>{v}</dd>
    </div>
  );
}

function Chart({ title, points, warn }: { title: string; points: Point[]; warn?: boolean }) {
  const max = Math.max(1, ...points.map((p) => p.n));
  return (
    <GlassCard className="p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[12px] font-medium">{title}</span>
        <span className="text-[11.5px] text-subtle">14 days · {sum(points)}</span>
      </div>
      <div className="mt-3 flex h-20 items-end gap-1">
        {points.map((p) => (
          <div key={p.day} className="group relative flex-1">
            <div
              className={`w-full rounded-t ${warn && p.n > 0 ? "bg-danger/70" : "bg-black/80"}`}
              style={{ height: `${Math.max(2, (p.n / max) * 80)}px`, opacity: p.n ? 1 : 0.15 }}
            />
            <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black px-1.5 py-0.5 text-[10px] text-white group-hover:block">
              {p.day.slice(5)}: {p.n}
            </span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
