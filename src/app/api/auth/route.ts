import { z } from "zod";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { clearSessionCookieHeader, currentSession, regionBlocked, sessionCookieHeader } from "@/lib/privi/session";
import { rateLimit } from "@/lib/privi/kv";
import {
  authenticationOptions,
  registrationOptions,
  relyingParty,
  signOut,
  verifyAuthentication,
  verifyRegistration,
} from "@/lib/privi/auth";
import { bump, serverError } from "@/lib/privi/telemetry";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register-options") }),
  z.object({ action: z.literal("register-verify"), response: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("login-options") }),
  z.object({ action: z.literal("login-verify"), response: z.record(z.string(), z.unknown()) }),
  z.object({ action: z.literal("logout") }),
]);

export async function GET() {
  const { account } = await currentSession();
  return Response.json({ signedIn: Boolean(account), passkeys: account?.credentials.length ?? 0 });
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { browserId, setCookie, ip } = await currentSession();
  const headers: Record<string, string> = {};
  if (setCookie) headers["set-cookie"] = sessionCookieHeader(setCookie.value);

  if (await regionBlocked()) return Response.json({ error: "Privi isn't available in your region." }, { status: 451, headers });
  const rl = await rateLimit(`auth:${ip}`, 20, 60);
  if (!rl.ok) return Response.json({ error: "Too many attempts. Try again shortly." }, { status: 429, headers });

  try {
    const rp = relyingParty(req.headers.get("origin"));
    const b = parsed.data;
    switch (b.action) {
      case "register-options":
        return Response.json(await registrationOptions(browserId, rp), { headers });
      case "register-verify": {
        const reg = await rateLimit(`register:${ip}`, 5, 3600);
        if (!reg.ok) return Response.json({ error: "Too many new accounts from this network. Try again later." }, { status: 429, headers });
        const { token } = await verifyRegistration(browserId, rp, b.response as unknown as RegistrationResponseJSON);
        await bump("signups");
        headers["set-cookie"] = sessionCookieHeader(token); // rotate: the old cookie no longer opens this balance
        return Response.json({ signedIn: true }, { headers });
      }
      case "login-options":
        return Response.json(await authenticationOptions(browserId, rp), { headers });
      case "login-verify": {
        const { token } = await verifyAuthentication(browserId, rp, b.response as unknown as AuthenticationResponseJSON);
        await bump("logins");
        // A fresh sign-in token; the account's balance id never leaves the server.
        headers["set-cookie"] = sessionCookieHeader(token);
        return Response.json({ signedIn: true }, { headers });
      }
      case "logout": {
        await signOut(browserId); // revokes this cookie server-side
        headers["set-cookie"] = clearSessionCookieHeader();
        return Response.json({ signedIn: false }, { headers });
      }
    }
  } catch (e) {
    await serverError(`auth:${parsed.data.action}`, e, browserId);
    if (parsed.data.action.endsWith("-verify")) await bump("passkey_fail");
    return Response.json({ error: (e as Error).message }, { status: 400, headers });
  }
}
