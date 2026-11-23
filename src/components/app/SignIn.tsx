"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, KeyRound, Lock } from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { GlassCard, Kicker } from "@/components/ui/glass";
import { Button } from "@/components/ui/button";
import { reportError } from "@/lib/client/report";

type Kind = "create" | "signin";
type Options = Record<string, unknown>;

async function post(body: object) {
  const r = await fetch("/api/auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Something went wrong.");
  return j;
}

/**
 * In-app browsers (X, Instagram, Facebook, TikTok, LinkedIn, Snapchat, Line,
 * Android WebViews) usually can't create or use passkeys.
 */
function inAppBrowser(ua: string): string | null {
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook";
  if (/Twitter|TwitterAndroid/i.test(ua)) return "X";
  if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) return "TikTok";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/\bLine\//i.test(ua)) return "Line";
  if (/; wv\)/.test(ua)) return "this app";
  return null;
}

const OPTIONS_TTL_MS = 4 * 60_000; // server challenges live 5 minutes

/**
 * Passkey sign-in. Options are fetched before the tap, so the button calls the
 * browser's passkey prompt immediately: iOS Safari only allows it within the
 * user gesture, and a network round trip first can make it refuse.
 */
export function SignIn({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ app: string | null; noPasskeys: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const inFlight = useRef(false);
  const opts = useRef<{ create?: { o: Options; at: number }; signin?: { o: Options; at: number } }>({});

  const prefetch = useCallback(async () => {
    if (inFlight.current) return; // never replace a challenge mid-ceremony
    const [c, s] = await Promise.allSettled([post({ action: "register-options" }), post({ action: "login-options" })]);
    const now = Date.now();
    if (c.status === "fulfilled") opts.current.create = { o: c.value, at: now };
    if (s.status === "fulfilled") opts.current.signin = { o: s.value, at: now };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const app = inAppBrowser(navigator.userAgent);
      const noPasskeys = typeof window.PublicKeyCredential === "undefined";
      if (app || noPasskeys) setBlocked({ app, noPasskeys });
    }, 0);
    void prefetch();
    const iv = setInterval(() => void prefetch(), OPTIONS_TTL_MS);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [prefetch]);

  const run = async (kind: Kind) => {
    setBusy(kind);
    setError(null);
    inFlight.current = true;
    // Use the prefetched options so the passkey prompt opens within this tap.
    const cached = opts.current[kind];
    const fresh = cached && Date.now() - cached.at < OPTIONS_TTL_MS ? cached.o : null;
    opts.current[kind] = undefined; // a challenge is single-use
    try {
      if (kind === "create") {
        const optionsJSON = fresh ?? (await post({ action: "register-options" }));
        const response = await startRegistration({ optionsJSON: optionsJSON as Parameters<typeof startRegistration>[0]["optionsJSON"] });
        await post({ action: "register-verify", response });
      } else {
        const optionsJSON = fresh ?? (await post({ action: "login-options" }));
        const response = await startAuthentication({ optionsJSON: optionsJSON as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
        await post({ action: "login-verify", response });
      }
      onDone();
    } catch (e) {
      const err = e as Error;
      reportError(`passkey:${kind}`, err);
      const text = `${err.name} ${err.message ?? ""}`;
      if (/NotAllowed|abort|cancel|timed out/i.test(text)) {
        setError(
          kind === "signin"
            ? "No passkey was used. If you haven't made an account on this device yet, choose Create account."
            : "The passkey prompt was closed or blocked. Try again, and if no prompt appears, open priviagents.com in Safari or Chrome.",
        );
      } else if (/InvalidState|already registered|excludeCredentials/i.test(text)) {
        setError("This device already has a Privi passkey. Choose “I have a passkey” instead.");
      } else if (/NotSupported|SecurityError/i.test(text)) {
        setError("This browser can't use passkeys here. Open priviagents.com in Safari or Chrome.");
      } else {
        setError(err.message || "Something went wrong. Try again.");
      }
      inFlight.current = false;
      void prefetch(); // fresh challenge for the retry
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/app`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center py-10">
      <GlassCard strong className="w-full max-w-[420px] p-7">
        <div className="flex items-center justify-between">
          <Kicker>Sign in</Kicker>
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-subtle">
            <Lock size={11} /> Privacy Ring
          </span>
        </div>
        <h1 className="mt-4 text-[26px] font-semibold leading-tight tracking-tight">Your private balance, behind a passkey.</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          No email, no password. Face ID, Touch ID or a security key unlocks your balance and approves every purchase your agent makes.
        </p>

        {blocked && (
          <div className="mt-5 rounded-xl border border-line bg-black/[0.03] p-3.5 text-[13px] leading-relaxed">
            <p className="font-medium">
              {blocked.app ? `Passkeys don't work inside ${blocked.app}'s browser.` : "This browser doesn't support passkeys."}
            </p>
            <p className="mt-1 text-muted">Open priviagents.com in Safari (iPhone) or Chrome (Android) to create your account.</p>
            <button onClick={copyLink} className="mt-2.5 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] hover:border-black/30">
              {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Link copied" : "Copy link"}
            </button>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Button size="lg" disabled={busy !== null} onClick={() => run("create")}>
            <KeyRound size={15} /> {busy === "create" ? "Creating passkey…" : "Create account"}
          </Button>
          <Button size="lg" variant="outline" disabled={busy !== null} onClick={() => run("signin")}>
            {busy === "signin" ? "Signing in…" : "I have a passkey"}
          </Button>
        </div>
        {error && (
          <p className="mt-4 text-[13px] leading-relaxed text-danger" role="alert">
            {error}
          </p>
        )}
      </GlassCard>
    </div>
  );
}
