import { z } from "zod";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/privi/kv";
import { hashIp, saveReport, SEVERITIES } from "@/lib/privi/reports";

// Public intake for vulnerability reports (priviagents.com/bug-bounty).

const Body = z.object({
  title: z.string().trim().min(5).max(200),
  severity: z.enum(SEVERITIES),
  area: z.string().trim().min(1).max(80),
  description: z.string().trim().min(30).max(20_000),
  steps: z.string().trim().max(20_000).default(""),
  contact: z.string().trim().min(3).max(200),
  payout: z.string().trim().max(64).optional(),
  website: z.string().max(500).optional(), // honeypot: real people leave it empty
});

export async function POST(req: Request) {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || "unknown";
  const [perIp, perDay] = await Promise.all([rateLimit(`report:ip:${ip}`, 5, 3600), rateLimit("report:all", 300, 86_400)]);
  if (!perIp.ok || !perDay.ok) {
    return Response.json({ error: "Too many reports right now. Try again later, or DM @priviagents on X." }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return Response.json({ error: field ? `Check the "${String(field)}" field.` : "Invalid report." }, { status: 400 });
  }
  const { website, ...r } = parsed.data;
  if (website) return Response.json({ ok: true, id: "rpt_received" }); // bot: accept silently, store nothing
  const report = await saveReport({ ...r, payout: r.payout || undefined, ipHash: hashIp(ip) });
  return Response.json({ ok: true, id: report.id }, { headers: { "cache-control": "no-store" } });
}
