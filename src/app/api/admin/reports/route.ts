import { timingSafeEqual } from "node:crypto";
import { listReports } from "@/lib/privi/reports";

// Security reports from the bug bounty form. Bearer PRIVI_ADMIN_TOKEN only.

function authorized(req: Request): boolean {
  const expected = process.env.PRIVI_ADMIN_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 24 || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ reports: await listReports(200) }, { headers: { "cache-control": "no-store" } });
}
