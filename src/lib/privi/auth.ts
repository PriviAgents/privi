import "server-only";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { kv } from "./kv";
import { newId, newSessionId } from "./store";

/**
 * Passkey accounts (WebAuthn), stored in Redis. No email, no password.
 *
 * An account owns one balance, stored under `account.sessionId`. That id is
 * never a credential: the browser cookie holds a random sign-in token instead
 * (`authsess:{token}` -> account id), issued fresh on every sign-in and
 * registration and deleted on sign-out. A cookie that names an owned balance
 * without a live token is ignored (see `currentSession`).
 */

const THIRTY_DAYS = 60 * 60 * 24 * 30;

interface StoredCredential {
  id: string; // base64url credential id
  publicKey: string; // base64url COSE public key
  counter: number;
  transports?: string[];
  createdAt: string;
}

export interface Account {
  id: string;
  sessionId: string;
  createdAt: string;
  credentials: StoredCredential[];
}

const kUser = (id: string) => `user:${id}`;
const kCred = (credId: string) => `cred:${credId}`;
const kAuth = (sid: string) => `authsess:${sid}`;
const kOwner = (sid: string) => `sessowner:${sid}`;
// One key per issued challenge (5-minute TTL), so several can be outstanding
// at once: the sign-in screen prefetches options and may refresh them while a
// passkey prompt is open. Each challenge is accepted once, then deleted.
const kChal = (sid: string, kind: "reg" | "auth", challenge: string) => `chal:${kind}:${sid}:${challenge}`;
const CHALLENGE_TTL = 300;
/** How long the browser's passkey prompt stays open (the default 60s is too short on phones). */
const CEREMONY_TIMEOUT_MS = 180_000;

/** Claim an outstanding challenge for this session (single use). */
async function claim<T>(sid: string, kind: "reg" | "auth", challenge: string): Promise<T | null> {
  const key = kChal(sid, kind, challenge);
  const v = await kv.get<T>(key);
  if (v) await kv.del(key);
  return v;
}

const b64u = {
  enc: (b: Uint8Array) => Buffer.from(b).toString("base64url"),
  dec: (s: string) => new Uint8Array(Buffer.from(s, "base64url")),
};

/** Origins allowed to use passkeys, and the relying-party id for each. */
export function relyingParty(origin: string | null): { origin: string; rpID: string } {
  if (!origin) throw new Error("Missing Origin header.");
  const url = new URL(origin);
  const host = url.hostname;
  const allowed =
    host === "priviagents.com" ||
    host === "www.priviagents.com" ||
    ((host === "localhost" || host === "127.0.0.1") && process.env.NODE_ENV !== "production") ||
    (process.env.PRIVI_EXTRA_ORIGIN && origin === process.env.PRIVI_EXTRA_ORIGIN);
  if (!allowed) throw new Error("This origin can't use Privi passkeys.");
  // www and the apex share one passkey namespace.
  const rpID = host.endsWith("priviagents.com") ? "priviagents.com" : host;
  return { origin: url.origin, rpID };
}

/** The account a browser cookie is signed in to, if any. */
export async function signedInUser(browserId: string): Promise<Account | null> {
  const uid = await kv.get<string>(kAuth(browserId));
  return uid ? kv.get<Account>(kUser(uid)) : null;
}

/** True when this id is an account's balance (so it may only be reached by signing in). */
export async function isOwnedBalance(id: string): Promise<boolean> {
  return Boolean(await kv.get<string>(kOwner(id)));
}

/** A fresh sign-in token for the account: the new cookie value. */
async function issueToken(account: Account): Promise<string> {
  const token = newSessionId();
  await kv.set(kAuth(token), account.id, THIRTY_DAYS);
  return token;
}

// --- Registration -----------------------------------------------------------

/** Options for creating a new account. Adding passkeys to an existing account isn't offered. */
export async function registrationOptions(sessionId: string, rp: { rpID: string }) {
  if (await signedInUser(sessionId)) throw new Error("You're already signed in.");
  if (await isOwnedBalance(sessionId)) throw new Error("This balance already belongs to a passkey. Sign in instead.");
  const userId = newId("usr");
  const options = await generateRegistrationOptions({
    rpName: "Privi",
    rpID: rp.rpID,
    timeout: CEREMONY_TIMEOUT_MS,
    userName: `privi-${userId.slice(-6)}`,
    userDisplayName: "Privi account",
    userID: new TextEncoder().encode(userId),
    attestationType: "none",
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await kv.set(kChal(sessionId, "reg", options.challenge), { userId }, CHALLENGE_TTL);
  return options;
}

/** Creates the account for this browser's balance. Returns it with the new sign-in token. */
export async function verifyRegistration(
  sessionId: string,
  rp: { origin: string; rpID: string },
  response: RegistrationResponseJSON,
): Promise<{ account: Account; token: string }> {
  const held: { chal: { userId: string } | null } = { chal: null };
  let v: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    v = await verifyRegistrationResponse({
      response,
      expectedChallenge: async (c) => Boolean((held.chal = await claim<{ userId: string }>(sessionId, "reg", c))),
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
    });
  } catch (e) {
    if (!held.chal) throw new Error("Passkey setup expired. Try again.");
    throw e;
  }
  const chal = held.chal;
  if (!chal) throw new Error("Passkey setup expired. Try again.");
  if (!v.verified || !v.registrationInfo) throw new Error("Passkey could not be verified.");
  const c = v.registrationInfo.credential;

  // New accounts only, on a balance nobody owns, with a credential id not yet
  // registered. One registration per balance at a time.
  if (await signedInUser(sessionId)) throw new Error("You're already signed in.");
  if ((await kv.get(kUser(chal.userId))) || (await isOwnedBalance(sessionId))) {
    throw new Error("This balance already belongs to a passkey. Sign in instead.");
  }
  if (await kv.get(kCred(c.id))) throw new Error("This passkey is already registered. Sign in instead.");
  if (!(await kv.setNx(`regclaim:${sessionId}`, chal.userId, 60))) throw new Error("Passkey setup is already in progress.");

  const account: Account = {
    id: chal.userId,
    sessionId, // the balance this browser already has becomes the account's
    createdAt: new Date().toISOString(),
    credentials: [{ id: c.id, publicKey: b64u.enc(c.publicKey), counter: c.counter, transports: c.transports, createdAt: new Date().toISOString() }],
  };
  await kv.set(kUser(account.id), account);
  await kv.set(kCred(c.id), account.id);
  await kv.set(kOwner(account.sessionId), account.id);
  return { account, token: await issueToken(account) };
}

// --- Sign in ----------------------------------------------------------------

export async function authenticationOptions(sessionId: string, rp: { rpID: string }) {
  // Discoverable credentials: the device offers whichever Privi passkey it holds.
  const options = await generateAuthenticationOptions({ rpID: rp.rpID, userVerification: "preferred", timeout: CEREMONY_TIMEOUT_MS });
  await kv.set(kChal(sessionId, "auth", options.challenge), { at: Date.now() }, CHALLENGE_TTL);
  return options;
}

/** Verifies a sign-in. Returns the account and a fresh sign-in token for the cookie. */
export async function verifyAuthentication(
  sessionId: string,
  rp: { origin: string; rpID: string },
  response: AuthenticationResponseJSON,
): Promise<{ account: Account; token: string }> {
  const uid = await kv.get<string>(kCred(response.id));
  const account = uid ? await kv.get<Account>(kUser(uid)) : null;
  const cred = account?.credentials.find((c) => c.id === response.id);
  if (!account || !cred) throw new Error("This passkey isn't registered with Privi.");
  let claimed = false;
  let v: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    v = await verifyAuthenticationResponse({
      response,
      expectedChallenge: async (c) => (claimed = Boolean(await claim(sessionId, "auth", c))),
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpID,
      credential: { id: cred.id, publicKey: b64u.dec(cred.publicKey), counter: cred.counter, transports: cred.transports },
    });
  } catch (e) {
    if (!claimed) throw new Error("Sign-in expired. Try again.");
    throw e;
  }
  if (!claimed) throw new Error("Sign-in expired. Try again.");
  if (!v.verified) throw new Error("Passkey could not be verified.");
  cred.counter = v.authenticationInfo.newCounter;
  await kv.set(kUser(account.id), account);
  // Retire the old cookie and any legacy cookie equal to the balance id.
  await kv.del(kAuth(account.sessionId));
  if (sessionId !== account.sessionId) await kv.del(kAuth(sessionId));
  return { account, token: await issueToken(account) };
}

export async function signOut(browserId: string) {
  await kv.del(kAuth(browserId));
}
