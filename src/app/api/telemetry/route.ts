import { z } from "zod";
import { headers } from "next/headers";
import { rateLimit } from "@/lib/privi/kv";
import { recordError } from "@/lib/privi/telemetry";

const Body = z.object({
  where: z.string().max(60),
  name: z.string().max(80).optional(),
  message: z.string().max(500),
  path: z.string().max(120).optional(),
});

/** Browser error reports (sign-in failures, chat errors, crashes). */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 204 });
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  // Untrusted input: tight per-client and global quotas, and a separate list
  // from server errors, so reports can't flood or evict the audit trail.
  const [mine, all] = await Promise.all([rateLimit(`telemetry:${ip}`, 10, 600), rateLimit("telemetry:all", 300, 3600)]);
  if (!mine.ok || !all.ok) return new Response(null, { status: 204 });
  const sid = (h.get("cookie") ?? "").match(/privi_session=([a-f0-9]{6})/)?.[1];
  await recordError({ source: "client", ...parsed.data, ua: h.get("user-agent") ?? undefined, sid });
  return new Response(null, { status: 204 });
}
