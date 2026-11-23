import "server-only";
import { createHash } from "node:crypto";
import { kv } from "./kv";
import { newId } from "./store";

/**
 * Security reports submitted through priviagents.com/bug-bounty: the fallback
 * when GitHub's private advisory form isn't available to a researcher. Stored
 * in Redis (newest first) and read from the admin dashboard.
 */

export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type ReportSeverity = (typeof SEVERITIES)[number];

export interface SecurityReport {
  id: string;
  at: string;
  title: string;
  severity: ReportSeverity;
  area: string;
  description: string;
  steps: string;
  contact: string;
  payout?: string;
  /** Salted hash of the submitter's IP, to spot floods without storing the address. */
  ipHash: string;
}

const KEY = "security:reports";
const MAX = 1000;

export function hashIp(ip: string): string {
  const salt = process.env.PRIVI_ADMIN_TOKEN ?? "privi";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 16);
}

export async function saveReport(r: Omit<SecurityReport, "id" | "at">): Promise<SecurityReport> {
  const report: SecurityReport = { id: newId("rpt"), at: new Date().toISOString(), ...r };
  await kv.listPush(KEY, report, MAX);
  return report;
}

export async function listReports(count = 200): Promise<SecurityReport[]> {
  return kv.listRange<SecurityReport>(KEY, count);
}
