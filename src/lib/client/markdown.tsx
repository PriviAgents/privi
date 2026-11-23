import * as React from "react";

/**
 * Deliberately tiny markdown renderer for agent replies: paragraphs, bullet
 * and numbered lists, **bold**, `code`, and links. No HTML passthrough; links
 * are restricted to http(s) and open in a new tab.
 */
export function Markdown({ text, streaming, allowedLinks }: { text: string; streaming?: boolean; allowedLinks?: Set<string> }) {
  const blocks = splitBlocks(text);
  const ctx: Ctx = { allowed: allowedLinks };
  return (
    <div className={`prose-chat text-[15px] leading-[1.65] ${streaming ? "is-streaming" : ""}`}>
      {blocks.map((b, i) => {
        if (b.type === "ul")
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{inline(it, ctx)}</li>
              ))}
            </ul>
          );
        if (b.type === "ol")
          return (
            <ol key={i}>
              {b.items.map((it, j) => (
                <li key={j}>{inline(it, ctx)}</li>
              ))}
            </ol>
          );
        return <p key={i}>{inline(b.text, ctx)}</p>;
      })}
    </div>
  );
}

type Block =
  | { type: "p"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

function splitBlocks(text: string): Block[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ type: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const ul = /^\s*[-*•]\s+(.*)$/.exec(line);
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ul) {
      flush();
      const last = out[out.length - 1];
      if (last?.type === "ul") last.items.push(ul[1]);
      else out.push({ type: "ul", items: [ul[1]] });
    } else if (ol) {
      flush();
      const last = out[out.length - 1];
      if (last?.type === "ol") last.items.push(ol[1]);
      else out.push({ type: "ol", items: [ol[1]] });
    } else if (line.trim() === "") {
      flush();
    } else {
      para.push(line.replace(/^#+\s*/, "").trim());
    }
  }
  flush();
  return out;
}

function hostOf(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

/** Compare URLs loosely: ignore protocol, "www.", trailing slash and hash. */
export function urlKey(u: string): string {
  try {
    const x = new URL(u);
    return `${x.hostname.replace(/^www\./, "")}${x.pathname.replace(/\/+$/, "")}${x.search}`.toLowerCase();
  } catch {
    return u.toLowerCase();
  }
}

type Ctx = { allowed?: Set<string> };

function inline(s: string, ctx: Ctx = {}): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Links first so a link inside bold still parses; bold content recurses.
  const re = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\*\*(?:[^*]|\*(?!\*))+\*\*|`[^`]+`|https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"*])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) nodes.push(s.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) nodes.push(<strong key={k++}>{inline(tok.slice(2, -2), ctx)}</strong>);
    else if (tok.startsWith("`")) nodes.push(<code key={k++}>{tok.slice(1, -1)}</code>);
    else {
      const md = /^\[([^\]]+)\]\((.+)\)$/.exec(tok);
      const href = md ? md[2] : tok;
      const label = md ? md[1] : hostOf(tok);
      // Only link to pages the agent actually found this conversation; a URL
      // the model wrote from memory renders as plain text, never a dead link.
      const ok = !ctx.allowed || ctx.allowed.has(urlKey(href));
      nodes.push(
        ok ? (
          <a key={k++} href={href} target="_blank" rel="noopener noreferrer nofollow">
            {label}
          </a>
        ) : (
          <span key={k++}>{label}</span>
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < s.length) nodes.push(s.slice(last));
  return nodes;
}
