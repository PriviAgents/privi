"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Plus, Share, Smartphone, SquarePlus, X } from "lucide-react";
import "./install.css";

type Platform = "ios" | "android" | "other";

/** Chrome / Edge / Samsung Internet's install prompt (not in TypeScript's DOM types). */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detect(): { platform: Platform; standalone: boolean; inApp: boolean } {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const inApp = /Instagram|FBAN|FBAV|FB_IAB|Twitter|musical_ly|TikTok|LinkedInApp|Snapchat|\bLine\/|; wv\)/i.test(ua);
  return { platform: ios ? "ios" : android ? "android" : "other", standalone, inApp };
}

/**
 * "Get the app": add Privi to the home screen and open it full screen like an
 * app. Android installs through the browser's prompt; iPhone has no prompt, so
 * we show the Share → Add to Home Screen steps. Hidden once installed.
 */
export function InstallApp() {
  const [env, setEnv] = useState<ReturnType<typeof detect> | null>(null);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEnv(detect()), 0);
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it for our button instead of the browser's mini-bar
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setEnv((v) => (v ? { ...v, standalone: true } : v));
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Only on phones, only in a browser that can install, never once installed.
  if (!env || env.standalone || env.inApp || (env.platform === "other" && !prompt)) return null;

  const onClick = async () => {
    // iPhone never offers a prompt; elsewhere use the browser's, and fall back to the steps.
    if (prompt && env.platform !== "ios") {
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice.catch(() => null);
        if (choice?.outcome === "accepted") setPrompt(null);
        return;
      } catch {
        /* the prompt can only be used once, or was refused: show the steps */
      }
    }
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label="Get the app"
        className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-line bg-white/80 px-3 text-[12.5px] font-medium text-foreground transition-colors hover:border-black/25 lg:hidden"
      >
        <Smartphone size={13} /> <span className="hidden min-[360px]:inline">Get the app</span>
      </button>
      {open && <InstallSheet platform={env.platform} onClose={() => setOpen(false)} />}
    </>
  );
}

function InstallSheet({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const steps =
    platform === "ios"
      ? [
          { icon: Share, text: <>Tap <b>Share</b> in Safari&apos;s toolbar</> },
          { icon: SquarePlus, text: <>Scroll down and tap <b>Add to Home Screen</b></> },
          { icon: Plus, text: <>Tap <b>Add</b>. Privi opens full screen, like an app</> },
        ]
      : [
          { icon: Share, text: <>Open your browser&apos;s menu <b>⋮</b></> },
          { icon: SquarePlus, text: <>Tap <b>Install app</b> or <b>Add to Home screen</b></> },
          { icon: Plus, text: <>Confirm. Privi opens full screen, like an app</> },
        ];

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <button type="button" aria-label="Close" onClick={onClose} className="sheet-backdrop absolute inset-0 cursor-default bg-black/30 backdrop-blur-[2px]" />
      <div className="sheet-up relative w-full max-w-md rounded-t-[28px] border border-line bg-white px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_60px_-20px_rgba(0,0,0,0.35)]">
        <div className="mx-auto h-1 w-10 rounded-full bg-black/15" aria-hidden />
        <div className="mt-4 flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/app-icons/icon-192.png" alt="" className="size-14 shrink-0 rounded-[14px] shadow-[0_8px_20px_-8px_rgba(0,0,0,0.5)]" />
          <div className="min-w-0 flex-1">
            <h2 id="install-title" className="text-[18px] font-semibold tracking-tight">Add Privi to your home screen</h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-muted">Open it in one tap, full screen, with your passkey. No app store needed.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:bg-black/[0.05]">
            <X size={17} />
          </button>
        </div>
        <ol className="mt-5 space-y-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-black/[0.02] px-4 py-3 text-[14px]">
              <span className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-black text-[11.5px] font-semibold text-white">{i + 1}</span>
              <span className="flex-1 [&_b]:font-semibold">{s.text}</span>
              <s.icon size={17} className="shrink-0 text-foreground/60" />
            </li>
          ))}
        </ol>
        {platform === "ios" && (
          <p className="mt-4 text-center text-[12px] text-subtle">Works in Safari and Chrome. Sign in once with your passkey inside the app.</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
