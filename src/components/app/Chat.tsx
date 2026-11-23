"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { ArrowDown, ArrowUp, Square } from "lucide-react";
import { GlassCard } from "@/components/ui/glass";
import { PriviMark } from "@/components/ui/logo";
import { DRAFT_KEY } from "@/lib/client/draft";
import { Markdown, urlKey } from "@/lib/client/markdown";
import { reportError } from "@/lib/client/report";
import type { AgentEvent } from "@/lib/agent/run";
import { ToolCard, type ToolBlock } from "./ToolCard";
import { useApp, type AppState } from "./state";

export interface ChatHandle {
  send: (text: string) => void;
  clear: () => void;
}

type Block = { type: "text"; text: string } | ToolBlock;
type Item =
  | { role: "user"; id: string; text: string }
  | { role: "assistant"; id: string; blocks: Block[]; error?: string };
type Patch = (fn: (b: Block[]) => Block[], err?: string) => void;

const SUGGESTIONS = [
  "Find a hotel in Lisbon for next weekend",
  "Get me a $50 Uber Eats card",
  "Best noise-cancelling headphones under $200",
  "A $100 Airbnb gift card",
];

/** Fold one SSE event into the in-flight assistant turn. */
function handleEvent(ev: AgentEvent, patch: Patch, apply: (p: Partial<AppState>) => void) {
  switch (ev.type) {
    case "text":
      patch((b) => {
        const last = b[b.length - 1];
        if (last?.type === "text") return [...b.slice(0, -1), { type: "text", text: last.text + ev.delta }];
        return [...b, { type: "text", text: ev.delta }];
      });
      break;
    case "tool_start":
      patch((b) => [...b, { type: "tool", id: ev.id, name: ev.name, status: "running" }]);
      break;
    case "tool_input":
      patch((b) => b.map((x) => (x.type === "tool" && x.id === ev.id ? { ...x, input: ev.input } : x)));
      break;
    case "tool_result":
      patch((b) =>
        b.map((x) =>
          x.type === "tool" && x.id === ev.id
            ? { ...x, result: ev.result, status: ev.isError ? "error" : "done" }
            : x,
        ),
      );
      break;
    case "state":
      apply(ev.session);
      break;
    case "error":
      patch((b) => b, ev.message);
      break;
    case "done":
      break;
  }
}

export const Chat = forwardRef<ChatHandle>(function Chat(_props, ref) {
  const { state, apply, refresh } = useApp();
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A request typed into the landing page's teaser box arrives as `?q=`. Stash
  // it in sessionStorage (the chat unmounts behind sign-in), then prefill once
  // signed in. Prefill only; never auto-send.
  useEffect(() => {
    const url = new URL(window.location.href);
    const q = url.searchParams.get("q");
    if (q === null) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, q);
    } catch {}
    url.searchParams.delete("q");
    window.history.replaceState(null, "", url);
  }, []);
  const signedIn = state?.signedIn;
  useEffect(() => {
    if (!signedIn) return;
    const raf = requestAnimationFrame(() => {
      let draft: string | null = null;
      try {
        draft = sessionStorage.getItem(DRAFT_KEY);
        sessionStorage.removeItem(DRAFT_KEY);
      } catch {}
      if (draft?.trim()) {
        setInput(draft.slice(0, 500));
        inputRef.current?.focus();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [signedIn]);

  const [pinned, setPinned] = useState(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (el) setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };
  const toBottom = (smooth = true) => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => {
    if (!pinned) return;
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: busy ? "auto" : "smooth" });
  }, [items, pinned, busy]);

  const send = useCallback(
    async (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      setInput("");
      if (inputRef.current) inputRef.current.style.height = "auto";
      setPinned(true);
      setBusy(true);
      const userId = crypto.randomUUID();
      const asstId = crypto.randomUUID();
      setItems((prev) => [
        ...prev,
        { role: "user", id: userId, text: t },
        { role: "assistant", id: asstId, blocks: [] },
      ]);

      const patch: Patch = (fn, error) =>
        setItems((prev) =>
          prev.map((it) =>
            it.id === asstId && it.role === "assistant"
              ? { ...it, blocks: fn(it.blocks), error: error ?? it.error }
              : it,
          ),
        );

      const ac = new AbortController();
      abortRef.current = ac;
      try {
        const post = () =>
          fetch("/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ message: t }),
            signal: ac.signal,
          });
        let res = await post();
        // At capacity: wait as told and try again, up to twice, before surfacing it.
        for (let attempt = 0; res.status === 503 && attempt < 2; attempt++) {
          const wait = Number(res.headers.get("retry-after") ?? 5) * 1000;
          await new Promise((r) => setTimeout(r, wait));
          res = await post();
        }
        if (!res.ok || !res.body) {
          const j = await res.json().catch(() => ({}));
          if (res.status !== 401) reportError("chat:request", { name: `HTTP ${res.status}`, message: j.error ?? "request failed" });
          patch((b) => b, j.error ?? `Request failed (${res.status})`);
          return;
        }
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let idx: number;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            const ev = JSON.parse(line.slice(6)) as AgentEvent;
            handleEvent(ev, patch, apply);
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          reportError("chat:stream", e);
          patch((b) => b, (e as Error).message);
        }
      } finally {
        setBusy(false);
        abortRef.current = null;
        void refresh();
      }
    },
    [busy, refresh, apply],
  );

  useImperativeHandle(ref, () => ({ send: (t) => void send(t), clear: () => setItems([]) }), [send]);

  const stop = () => abortRef.current?.abort();

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const agentReady = state?.agentReady ?? true;

  // Every page the agent actually found (search results, fetched pages).
  const allowedLinks = new Set<string>();
  for (const it of items) {
    if (it.role !== "assistant") continue;
    for (const b of it.blocks) {
      if (b.type !== "tool") continue;
      const src = (b.result as { sources?: { url: string }[] } | undefined)?.sources ?? [];
      for (const x of src) allowedLinks.add(urlKey(x.url));
    }
  }

  return (
    <GlassCard className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden lg:max-h-[calc(100dvh-5.5rem)] lg:min-h-[70dvh]">
      <div ref={scrollRef} onScroll={onScroll} className="scroll-thin flex-1 overflow-y-auto px-4 pb-6 pt-6 sm:px-8">
        {items.length === 0 ? (
          <Empty onPick={(s) => void send(s)} disabled={!agentReady} />
        ) : (
          <div className="mx-auto flex max-w-[720px] flex-col gap-7">
            {items.map((it) =>
              it.role === "user" ? (
                <div key={it.id} className="msg-in flex justify-end">
                  <div className="max-w-[80%] whitespace-pre-wrap rounded-[20px] rounded-br-[6px] bg-black px-4 py-2.5 text-[15px] leading-[1.5] text-white shadow-[0_6px_18px_-10px_rgba(0,0,0,0.5)]">
                    {it.text}
                  </div>
                </div>
              ) : (
                <AssistantTurn key={it.id} item={it} allowedLinks={allowedLinks} streaming={busy && it.id === items[items.length - 1]?.id} />
              ),
            )}
          </div>
        )}
      </div>

      {!pinned && items.length > 0 && (
        <button
          onClick={() => toBottom()}
          aria-label="Scroll to latest"
          className="fab-in absolute bottom-[120px] left-1/2 z-10 flex size-9 -translate-x-1/2 cursor-pointer items-center justify-center rounded-full border border-line bg-white/90 text-foreground shadow-[0_6px_20px_-8px_rgba(0,0,0,0.3)] backdrop-blur transition-transform hover:scale-105"
        >
          <ArrowDown size={15} />
        </button>
      )}

      <div className="px-3 pb-3 pt-1 sm:px-6 sm:pb-4">
        <div className="composer mx-auto flex max-w-[720px] items-end gap-2 rounded-[24px] border border-line bg-white p-2 pl-5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.18)] transition-[border-color,box-shadow] duration-200 focus-within:border-black/25 focus-within:shadow-[0_1px_2px_rgba(0,0,0,0.05),0_16px_40px_-16px_rgba(0,0,0,0.28)]">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder={agentReady ? "What do you need?" : "The agent is offline"}
            disabled={!agentReady}
            aria-label="Message"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-[1.45] sm:text-[15px] outline-none focus-visible:outline-none placeholder:text-subtle disabled:opacity-50"
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
            }}
          />
          {busy ? (
            <button
              onClick={stop}
              className="send-btn flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black text-white"
              aria-label="Stop"
            >
              <Square size={12} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={() => void send(input)}
              disabled={!input.trim() || !agentReady}
              data-ready={input.trim() ? "" : undefined}
              className="send-btn flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black text-white disabled:cursor-not-allowed"
              aria-label="Send"
            >
              <ArrowUp size={17} strokeWidth={2.25} />
            </button>
          )}
        </div>
        <p className="mx-auto mt-2 max-w-[720px] px-2 text-center text-[11px] text-subtle">
          Privi asks for your approval before every purchase.
        </p>
      </div>
    </GlassCard>
  );
});

function AssistantTurn({ item, streaming, allowedLinks }: { item: Extract<Item, { role: "assistant" }>; streaming: boolean; allowedLinks: Set<string> }) {
  const empty = item.blocks.length === 0;
  const last = item.blocks[item.blocks.length - 1];
  const working = streaming && !empty && last?.type === "tool" && last.status !== "running";
  return (
    <div className="msg-in flex items-start gap-3.5">
      <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-black text-white shadow-[0_4px_12px_-6px_rgba(0,0,0,0.6)]">
        <PriviMark size={16} inverted />
      </div>
      <div className="min-w-0 flex-1 space-y-3 pt-0.5">
        {empty && streaming && <Thinking />}
        {item.blocks.map((b, i) =>
          b.type === "text" ? (
            <Markdown key={i} text={b.text} allowedLinks={allowedLinks} streaming={streaming && i === item.blocks.length - 1} />
          ) : (
            <ToolCard key={b.id} block={b} />
          ),
        )}
        {working && <Thinking />}
        {item.error && (
          <div className="msg-in rounded-xl border border-red-200/60 bg-red-50 px-3.5 py-2.5 text-[13px] text-danger">
            {item.error}
          </div>
        )}
      </div>
    </div>
  );
}

function Thinking() {
  return (
    <div className="msg-in flex h-6 items-center gap-2.5 text-[13px]" aria-live="polite">
      <span className="activity-spinner" aria-hidden />
      <span className="shimmer-text font-medium">Thinking</span>
    </div>
  );
}

function Empty({ onPick, disabled }: { onPick: (s: string) => void; disabled: boolean }) {
  return (
    <div className="mx-auto flex h-full max-w-[600px] flex-col items-center justify-center text-center">
      <div className="empty-mark flex size-14 items-center justify-center rounded-2xl bg-black text-white shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)]">
        <PriviMark size={30} inverted />
      </div>
      <h2 className="rise mt-6 text-[30px] font-semibold tracking-tight" style={{ animationDelay: "60ms" }}>
        What can I get you?
      </h2>
      <p className="rise mt-2 max-w-[440px] text-[14.5px] leading-[1.6] text-muted" style={{ animationDelay: "120ms" }}>
        Hotels, food, gear, gifts. I find the best options, show you real prices, and pay from your private balance once you approve.
      </p>
      <div className="mt-7 grid w-full gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => (
          <button
            key={s}
            disabled={disabled}
            onClick={() => onPick(s)}
            style={{ animationDelay: `${180 + i * 60}ms` }}
            className="rise group flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-line bg-white/70 px-4 py-3.5 text-left text-[13.5px] leading-[1.4] text-foreground/85 transition-[border-color,background-color,transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-black/20 hover:bg-white hover:shadow-[0_10px_24px_-14px_rgba(0,0,0,0.3)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span>{s}</span>
            <ArrowUp size={14} className="shrink-0 rotate-45 text-subtle transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}
