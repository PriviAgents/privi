import { connection } from "next/server";
import { getPrices } from "@/lib/privi/prices";

export async function GET() {
  await connection(); // always request-time; never prerender a price
  const snap = await getPrices();
  return Response.json(snap, {
    headers: { "cache-control": "public, max-age=5, stale-while-revalidate=10" },
  });
}
