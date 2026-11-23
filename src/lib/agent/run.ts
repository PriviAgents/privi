import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { SessionState } from "@/lib/privi/types";
import { loadTranscript, saveTranscript } from "@/lib/privi/store";
import { SYSTEM_PROMPT } from "./system";
import { TOOL_PARAMS, newToolContext, runTool, type Approval } from "./tools";

export const MODEL = "claude-opus-5-5";
const MAX_TURNS = 8;

/** Events streamed to the browser over SSE. */
export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string }
  | { type: "tool_input"; id: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; result: unknown; isError: boolean }
  | { type: "state"; session: Pick<SessionState, "wallet" | "orders" | "activity" | "deposits"> }
  | { type: "done"; stopReason: string | null }
  | { type: "error"; message: string };

let client: Anthropic | null = null;
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local to enable the agent.");
  }
  return (client ??= new Anthropic());
}

/** Anthropic-hosted web tools: find real listings, prices and links. */
const WEB_TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  { type: "web_search_20260209", name: "web_search", max_uses: 6 },
  { type: "web_fetch_20260209", name: "web_fetch", max_uses: 4 },
];
const TOOLS: Anthropic.Beta.BetaToolUnion[] = [...TOOL_PARAMS, ...WEB_TOOLS];

type SourceLink = { title: string; url: string };

/** Compact, UI-safe view of a server tool result block. */
function serverResult(block: Record<string, unknown>): { result: unknown; isError: boolean } {
  const content = block.content as unknown;
  if (block.type === "web_search_tool_result") {
    if (!Array.isArray(content)) return { result: { error: "Search unavailable right now." }, isError: true };
    const sources: SourceLink[] = content
      .filter((r: Record<string, unknown>) => r.type === "web_search_result")
      .slice(0, 20)
      .map((r: Record<string, unknown>) => ({ title: String(r.title ?? r.url), url: String(r.url) }));
    return { result: { sources }, isError: false };
  }
  const c = content as Record<string, unknown> | undefined;
  if (!c || c.type !== "web_fetch_result") return { result: { error: "Couldn't open that page." }, isError: true };
  const doc = c.content as Record<string, unknown> | undefined;
  return { result: { sources: [{ title: String(doc?.title ?? c.url), url: String(c.url) }] }, isError: false };
}

const STATE_CHANGING = new Set(["confirm_purchase", "cancel_order", "prepare_purchase", "prepare_product_order", "prepare_flight_booking", "prepare_hotel_booking", "check_order"]);

/**
 * Run one user turn: stream model output, execute tools, loop until the model
 * stops. Transcript is appended in place (append-only — preserved thinking
 * blocks must never be edited or reordered).
 */
export async function* runAgentTurn(
  session: SessionState,
  userText: string,
  onUsage?: (u: Anthropic.Beta.BetaUsage) => void,
): AsyncGenerator<AgentEvent> {
  const anthropic = getClient();
  const messages = await loadTranscript(session.id);
  messages.push({ role: "user", content: userText });
  try {
    yield* agentLoop(anthropic, session, messages, onUsage, { text: userText, startedAt: Date.now() });
  } finally {
    // Runs on normal completion, errors, and client aborts alike.
    await saveTranscript(session.id, messages);
  }
}

async function* agentLoop(
  anthropic: Anthropic,
  session: SessionState,
  messages: Anthropic.Beta.BetaMessageParam[],
  onUsage?: (u: Anthropic.Beta.BetaUsage) => void,
  approval?: Approval,
): AsyncGenerator<AgentEvent> {

  const ctx = newToolContext(session, approval);
  let jsonRetries = 0;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const stream = anthropic.beta.messages.stream({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: TOOLS,
      messages,
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      // Wrap iteration + finalMessage together: with eager input streaming,
      // unparseable tool JSON rejects whichever await is in flight.
      // Server tools (web search/fetch) run inside this stream: surface them
      // as activity rows. Their input arrives as JSON deltas per block index.
      const serverInputs = new Map<number, { id: string; json: string }>();
      for await (const event of stream) {
        if (event.type === "content_block_start") {
          const b = event.content_block as unknown as Record<string, unknown>;
          if (b.type === "tool_use") {
            yield { type: "tool_start", id: String(b.id), name: String(b.name) };
          } else if (b.type === "server_tool_use" && (b.name === "web_search" || b.name === "web_fetch")) {
            serverInputs.set(event.index, { id: String(b.id), json: "" });
            yield { type: "tool_start", id: String(b.id), name: String(b.name) };
          } else if (b.type === "web_search_tool_result" || b.type === "web_fetch_tool_result") {
            const { result, isError } = serverResult(b);
            yield { type: "tool_result", id: String(b.tool_use_id), name: String(b.type), result, isError };
          }
        } else if (event.type === "content_block_delta") {
          if (event.delta.type === "text_delta") yield { type: "text", delta: event.delta.text };
          else if (event.delta.type === "input_json_delta" && serverInputs.has(event.index)) {
            serverInputs.get(event.index)!.json += event.delta.partial_json;
          }
        } else if (event.type === "content_block_stop" && serverInputs.has(event.index)) {
          const s = serverInputs.get(event.index)!;
          try {
            yield { type: "tool_input", id: s.id, input: JSON.parse(s.json || "{}") };
          } catch {
            /* display only */
          }
        }
      }
      message = await stream.finalMessage();
      onUsage?.(message.usage);
      jsonRetries = 0;
    } catch (err) {
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      continue; // re-issue the turn; nothing was appended
    }

    const toolUses = message.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );

    if (message.stop_reason === "refusal") {
      messages.push({ role: "assistant", content: message.content });
      yield { type: "error", message: "The assistant declined this request." };
      yield { type: "done", stopReason: "refusal" };
      return;
    }
    if (message.stop_reason === "max_tokens" && toolUses.length) {
      throw new Error("Tool input truncated at max_tokens; please retry.");
    }

    messages.push({ role: "assistant", content: message.content });

    if (message.stop_reason === "pause_turn") continue;
    if (toolUses.length === 0) {
      yield { type: "done", stopReason: message.stop_reason };
      return;
    }

    // Execute all tool calls, return all results in ONE user message.
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    let stateChanged = false;
    for (const tu of toolUses) {
      yield { type: "tool_input", id: tu.id, input: tu.input };
      const r = await runTool(tu.name, tu.input, ctx);
      if (STATE_CHANGING.has(tu.name)) stateChanged = true;
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: r.ok ? JSON.stringify(r.result) : r.error,
        is_error: !r.ok,
      });
      yield {
        type: "tool_result",
        id: tu.id,
        name: tu.name,
        result: r.ok ? r.result : { error: r.error },
        isError: !r.ok,
      };
    }
    messages.push({ role: "user", content: results });
    if (stateChanged) {
      yield {
        type: "state",
        session: {
          wallet: session.wallet,
          orders: session.orders,
          activity: session.activity,
          deposits: session.deposits,
        },
      };
    }
  }

  yield { type: "error", message: "Stopped after too many tool steps. Ask me to continue." };
  yield { type: "done", stopReason: "max_turns" };
}
