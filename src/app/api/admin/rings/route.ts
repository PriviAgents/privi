import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { explorerTx, payFromRing, registerTreasury, ringBalances, ringsConfigured, sweepToRing } from "@/lib/privi/rings";

// Ops endpoint for the Privacy Rings treasury. Bearer PRIVI_ADMIN_TOKEN only.
export const maxDuration = 120;

function authorized(req: Request): boolean {
  const expected = process.env.PRIVI_ADMIN_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!expected || expected.length < 24 || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register") }),
  z.object({ action: z.literal("sweep") }),
  z.object({ action: z.literal("pay"), to: z.string().min(32).max(44), asset: z.enum(["SOL", "USDC"]), amount: z.number().positive() }),
]);

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!ringsConfigured()) return Response.json({ configured: false });
  try {
    return Response.json({ configured: true, ...(await ringBalances()) });
  } catch (e) {
    return Response.json({ configured: true, error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!ringsConfigured()) return Response.json({ error: "Privacy Rings not configured" }, { status: 400 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid request" }, { status: 400 });
  try {
    const b = parsed.data;
    if (b.action === "register") return Response.json(await registerTreasury());
    if (b.action === "sweep") return Response.json(await sweepToRing());
    const { signature } = await payFromRing({ to: b.to, asset: b.asset, amount: b.amount });
    return Response.json({ signature, url: explorerTx(signature) });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
