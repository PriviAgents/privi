/**
 * The Zauth Vector security scan of priviagents.com (2026-11-22) and what we
 * did about each finding. Rendered at /security-audit and served as JSON at
 * /security-audit/findings.json for agents and scrapers.
 */

export type Severity = "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type Status = "Fixed" | "Mitigated" | "Not applicable" | "False positive";

export interface Finding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  status: Status;
  resolution: string;
}

export const AUDIT = {
  auditor: "zauth",
  product: "Vector",
  mode: "Whitebox (source + live deployment)",
  target: "priviagents.com",
  scanId: "cmwsa8l6c00v4marhrfn171gl",
  started: "2026-11-22T20:21:34.644Z",
  completed: "2026-11-22T21:27:20.613Z",
  remediatedOn: "2026-11-22",
  reportPdf: "/security/zauth-vector-report-2026-11-22.pdf",
  reportMarkdown: "/security/zauth-vector-report-2026-11-22.md",
  totals: { HIGH: 4, MEDIUM: 8, LOW: 9, INFO: 3, CRITICAL: 0 },
} as const;

export const FINDINGS: Finding[] = [
  // --- High ---------------------------------------------------------------
  {
    id: "V-01",
    severity: "HIGH",
    category: "Authorization",
    title: "Passkey enrollment onto an existing account skipped the ownership guard",
    status: "Fixed",
    resolution:
      "Passkeys can now only create a new account. Adding a credential to an existing account is refused, and a passkey already registered can't be re-bound.",
  },
  {
    id: "V-02",
    severity: "HIGH",
    category: "Authorization",
    title: "Holder of a session cookie could bind their own passkey to that balance",
    status: "Fixed",
    resolution:
      "The browser cookie is no longer the balance identifier. It is a random sign-in token, issued fresh on every sign-in and account creation. A cookie that names an owned balance without a valid token is ignored and replaced.",
  },
  {
    id: "V-03",
    severity: "HIGH",
    category: "Other",
    title: "Unauthenticated, unthrottled writes to the admin error log and passkey-failure counter",
    status: "Fixed",
    resolution:
      "Browser error reports go to a separate, capped list and can no longer evict server-side errors. Per-client and global quotas apply, and the passkey-failure counter is only incremented by the server.",
  },
  {
    id: "V-04",
    severity: "HIGH",
    category: "Injection",
    title: "Dynamic code evaluation sink",
    status: "False positive",
    resolution:
      "The flagged call is a fixed, hard-coded Redis script; user data is only ever passed as parameters. The scanner's own triage marked it unreachable. No change needed.",
  },
  // --- Medium -------------------------------------------------------------
  {
    id: "V-05",
    severity: "MEDIUM",
    category: "Authentication",
    title: "Session fixation: client-chosen session id adopted at registration and never rotated",
    status: "Fixed",
    resolution: "The sign-in token is rotated on registration and on every sign-in, so an id planted before sign-up never becomes signed in.",
  },
  {
    id: "V-06",
    severity: "MEDIUM",
    category: "Authentication",
    title: "Sign-out could not revoke a stolen session",
    status: "Fixed",
    resolution: "Sign-out deletes the token server-side. Signing in also retires the previous token on that browser.",
  },
  {
    id: "V-07",
    severity: "MEDIUM",
    category: "Authorization",
    title: "Purchases could be confirmed without server-side evidence of user approval",
    status: "Fixed",
    resolution:
      "Payment now requires proof the agent can't produce: the order must have been shown in an earlier turn, and the user's own message in this turn must approve it (the Approve button or a short typed yes). Text inside web pages or tool results can't satisfy the check.",
  },
  {
    id: "V-08",
    severity: "MEDIUM",
    category: "Authorization",
    title: "Account state endpoint served the full account document without a sign-in check",
    status: "Fixed",
    resolution: "Balances, orders, deposits and activity are returned only to the signed-in owner.",
  },
  {
    id: "V-09",
    severity: "MEDIUM",
    category: "Other",
    title: "Account state endpoint returned approval tokens and traveller details",
    status: "Fixed",
    resolution: "Approval tokens, passenger, guest and payment-routing details are stripped from every dashboard response.",
  },
  {
    id: "V-10",
    severity: "MEDIUM",
    category: "Other",
    title: "Cookieless requests to state and auth endpoints each stored a new session",
    status: "Fixed",
    resolution: "Reads no longer write. An anonymous session is only stored once something changes it.",
  },
  {
    id: "V-11",
    severity: "MEDIUM",
    category: "Authorization",
    title: "Auth endpoint stored a new session per cookieless request",
    status: "Fixed",
    resolution: "Same root cause as V-10; the auth status check is now read-only.",
  },
  {
    id: "V-12",
    severity: "MEDIUM",
    category: "Server-Side Request Forgery",
    title: "Agent web fetch has no domain allow-list",
    status: "Mitigated",
    resolution:
      "Fetches run on Anthropic's infrastructure, not Privi's servers, so there is no access to internal services. Fetches are capped per turn, and the agent's purchase path doesn't rely on fetched pages. A domain allow-list is under review.",
  },
  // --- Low ----------------------------------------------------------------
  {
    id: "V-13",
    severity: "LOW",
    category: "Authentication",
    title: "Registration could overwrite an existing credential mapping",
    status: "Fixed",
    resolution: "Registration is refused for any credential id that is already registered.",
  },
  {
    id: "V-14",
    severity: "LOW",
    category: "Other",
    title: "No security response headers",
    status: "Fixed",
    resolution:
      "Every response now sends Content-Security-Policy (frame-ancestors, base-uri, object-src, form-action), X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy and HSTS.",
  },
  {
    id: "V-15",
    severity: "LOW",
    category: "Authorization",
    title: "Deposit submission relayed arbitrary transactions",
    status: "Fixed",
    resolution:
      "The server only relays a transaction that pays the deposit's own address and carries its unique reference key, with a small number of attempts per deposit.",
  },
  {
    id: "V-16",
    severity: "LOW",
    category: "Other",
    title: "Transaction links point to a third-party explorer",
    status: "Mitigated",
    resolution:
      "The explorer is Orb, run by Helius, Privi's Privacy Rings provider. Links open with no referrer, and a site-wide Referrer-Policy means the explorer never learns which Privi page you came from.",
  },
  {
    id: "V-17",
    severity: "LOW",
    category: "Other",
    title: "Transaction links point to a third-party explorer (duplicate)",
    status: "Mitigated",
    resolution: "Duplicate of V-16.",
  },
  {
    id: "V-18",
    severity: "LOW",
    category: "Other",
    title: "Unauthenticated telemetry could evict the error log",
    status: "Fixed",
    resolution: "Same root cause as V-03.",
  },
  {
    id: "V-19",
    severity: "LOW",
    category: "Other",
    title: "Regular expression with nested quantifiers (ReDoS)",
    status: "Fixed",
    resolution:
      "No regular expression existed at the flagged line. It was a payment-amount comparison, which we hardened anyway: integer-only arithmetic and strict validation of the amount a merchant requests.",
  },
  {
    id: "V-20",
    severity: "LOW",
    category: "Injection",
    title: "OS command execution sink",
    status: "False positive",
    resolution:
      "The flagged line is a regular expression used to render links in chat, not a command. Links were already restricted to http and https.",
  },
  {
    id: "V-21",
    severity: "LOW",
    category: "Authorization",
    title: "Sign-in check is skipped in demo mode",
    status: "Not applicable",
    resolution: "Demo mode only exists when no live funds are configured. Production always runs in live mode, where every money-moving action requires a signed-in passkey session.",
  },
  // --- Info ---------------------------------------------------------------
  {
    id: "V-22",
    severity: "INFO",
    category: "Other",
    title: "Missing Content-Security-Policy header",
    status: "Fixed",
    resolution: "See V-14.",
  },
  {
    id: "V-23",
    severity: "INFO",
    category: "Other",
    title: "Approval UI could be framed (clickjacking)",
    status: "Fixed",
    resolution: "frame-ancestors 'none' and X-Frame-Options: DENY prevent Privi from being embedded by other sites.",
  },
  {
    id: "V-24",
    severity: "INFO",
    category: "Authorization",
    title: "Unauthenticated writes could forge the admin error log",
    status: "Fixed",
    resolution: "Same root cause as V-03.",
  },
];

export function statusCounts() {
  const c: Record<Status, number> = { Fixed: 0, Mitigated: 0, "Not applicable": 0, "False positive": 0 };
  for (const f of FINDINGS) c[f.status]++;
  return c;
}
