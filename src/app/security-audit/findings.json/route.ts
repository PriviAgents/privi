import { AUDIT, FINDINGS, statusCounts } from "@/lib/security-audit";

/** Machine-readable audit summary for agents and scrapers. */
export function GET() {
  return Response.json(
    { audit: AUDIT, resolved: statusCounts(), findings: FINDINGS, page: "/security-audit" },
    { headers: { "cache-control": "public, max-age=3600" } },
  );
}
