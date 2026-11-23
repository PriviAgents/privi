"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, KeyRound, Lock } from "lucide-react";
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

type Platform = "ios" | "android" | "windows" | "mac" | "other";
function platformOf(ua: string): Platform {
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh/.test(ua)) return "mac";
  return "other";
}

/** A link that opens this page in the system browser from an in-app browser, where the OS supports one. */
function systemBrowserLink(platform: Platform): { href: string; label: string } | null {
  const url = `${location.origin}/app`;
  if (platform === "ios") return { href: `x-safari-${url}`, label: "Open in Safari" };
  if (platform === "android") return { href: `intent://${location.host}/app#Intent;scheme=https;package=com.android.chrome;end`, label: "Open in Chrome" };
  return null;
}

/** What to try when the passkey prompt is refused or fails, per platform. */
function setupHelp(platform: Platform): string {
  switch (platform) {
    case "ios":
      return "Passkeys need iCloud Keychain: Settings → your name → iCloud → Passwords & Keychain, and a device passcode. Then try again in Safari.";
    case "android":
      return "Passkeys need a screen lock and Google Password Manager. Set a screen lock in Settings, then try again in Chrome.";
    case "windows":
      return "Set up Windows Hello (Settings → Accounts → Sign-in options), or choose “Use a phone or tablet” in the prompt.";
    case "mac":
      return "Make sure iCloud Keychain or your browser's password manager is on, or choose “Use a phone or tablet” in the prompt.";
    default:
      return "Try again in Safari or Chrome on a device with a screen lock.";
  }
}

/**
 * Passkey sign-in. Options are fetched before the tap, so the button calls the
 * browser's passkey prompt immediately: iOS Safari only allows it within the
 * user gesture, and a network round trip first can make it refuse.
 */
export function SignIn({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState<Kind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ app: string | null; noPasskeys: boolean } | null>(null);
  const [platform, setPlatform] = useState<Platform>("other");
  const [copied, setCopied] = useState(false);
  // Options ready to use for each button; a button is only live when its options are.
  const [ready, setReady] = useState<{ create: boolean; signin: boolean }>({ create: false, signin: false });
  const inFlight = useRef(false);
  const opts = useRef<{ create?: { o: Options; at: number }; signin?: { o: Options; at: number } }>({});

  /**
   * Fetch fresh options. One request at a time: if the browser has no session
   * cookie yet, parallel requests would each get a different session and
   * strand one of the challenges.
   */
  const prefetch = useCallback(async (only?: Kind) => {
    if (inFlight.current) return; // never replace a challenge mid-ceremony
    const kinds: Kind[] = only ? [only] : ["create", "signin"];
    for (const kind of kinds) {
      try {
        const o = await post({ action: kind === "create" ? "register-options" : "login-options" });
        opts.current[kind] = { o, at: Date.now() };
        setReady((r) => ({ ...r, [kind]: true }));
      } catch {
        setReady((r) => ({ ...r, [kind]: false }));
      }
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      const ua = navigator.userAgent;
      const app = inAppBrowser(ua);
      const noPasskeys = typeof window.PublicKeyCredential === "undefined";
      setPlatform(platformOf(ua));
      if (app || noPasskeys) setBlocked({ app, noPasskeys });
      void prefetch();
    }, 0);
    const iv = setInterval(() => void prefetch(), OPTIONS_TTL_MS);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, [prefetch]);

  const run = async (kind: Kind) => {
    // The passkey prompt must open within this tap: iOS Safari refuses it after
    // any network wait. So only ever use options that are already here.
    const cached = opts.current[kind];
    const fresh = cached && Date.now() - cached.at < OPTIONS_TTL_MS ? cached.o : null;
    if (!fresh) {
      setReady((r) => ({ ...r, [kind]: false }));
      void prefetch(kind);
      return;
    }
    opts.current[kind] = undefined; // a challenge is single-use
    setReady((r) => ({ ...r, [kind]: false }));
    setBusy(kind);
    setError(null);
    setHelp(null);
    inFlight.current = true;
    const startedAt = performance.now();
    try {
      if (kind === "create") {
        const response = await startRegistration({ optionsJSON: fresh as unknown as Parameters<typeof startRegistration>[0]["optionsJSON"] });
        await post({ action: "register-verify", response });
      } else {
        const response = await startAuthentication({ optionsJSON: fresh as unknown as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
        await post({ action: "login-verify", response });
      }
      onDone();
    } catch (e) {
      const err = e as Error;
      const ms = Math.round(performance.now() - startedAt);
      // How fast it failed tells a refused prompt (instant) from a closed one.
      reportError(`passkey:${kind}`, { name: err.name, message: `${err.message ?? ""} [after ${ms}ms]` });
      const text = `${err.name} ${err.message ?? ""}`;
      if (/NotAllowed|abort|cancel|timed out/i.test(text)) {
        if (kind === "signin") {
          setError("No passkey was used. If you haven't created an account on this device, choose Create account.");
        } else {
          setError("The passkey wasn't created.");
          setHelp(setupHelp(platform));
        }
      } else if (/InvalidState|already registered|excludeCredentials/i.test(text)) {
        setError("This device already has a Privi passkey. Choose “I have a passkey” instead.");
      } else if (/NotSupported|SecurityError|Web Authentication service/i.test(text)) {
        setError("Passkeys aren't available in this browser right now.");
        setHelp(setupHelp(platform));
      } else {
        setError(err.message || "Something went wrong. Try again.");
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
      void prefetch(kind); // a fresh challenge for the retry, ready before the next tap
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
            <div className="mt-2.5 flex flex-wrap gap-2">
              {blocked.app && systemBrowserLink(platform) && (
                <a
                  href={systemBrowserLink(platform)!.href}
                  className="inline-flex items-center gap-1.5 rounded-full bg-black px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-black/85"
                >
                  <ExternalLink size={12} /> {systemBrowserLink(platform)!.label}
                </a>
              )}
              <button onClick={copyLink} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-[12.5px] hover:border-black/30">
                {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "Link copied" : "Copy link"}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <Button size="lg" disabled={busy !== null || !ready.create} onClick={() => run("create")}>
            <KeyRound size={15} /> {busy === "create" ? "Creating passkey…" : ready.create ? "Create account" : "Preparing…"}
          </Button>
          <Button size="lg" variant="outline" disabled={busy !== null || !ready.signin} onClick={() => run("signin")}>
            {busy === "signin" ? "Signing in…" : "I have a passkey"}
          </Button>
        </div>
        {error && (
          <div className="mt-4 text-[13px] leading-relaxed" role="alert">
            <p className="text-danger">{error}</p>
            {help && <p className="mt-1.5 text-muted">{help}</p>}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
