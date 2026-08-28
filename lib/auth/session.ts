import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30; // 30 days — see the note below.

function secret(): Uint8Array {
  const value = process.env.AUTH_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "Missing or too-short AUTH_SECRET (need 32+ chars). Generate one with " +
        "`openssl rand -base64 32` and put it in .env.local."
    );
  }
  return new TextEncoder().encode(value);
}

/**
 * Signs a session token for a user. 30 days, no silent refresh-on-activity
 * — a deliberate simplification for a single-operator app, not an
 * oversight: the alternative (re-issuing the cookie on every request that's
 * getting close to expiry) is real complexity for a threat model where the
 * cost of "logs in again after 30 days" is a minor inconvenience, not a
 * security gap.
 */
export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_LIFETIME_SECONDS}s`)
    .sign(secret());
}

/** Verifies a token and returns the user id, or null for anything invalid —
 * expired, tampered, wrong signature, or just malformed. Never throws. */
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Reads the current session cookie, verifies it, returns the user id or
 * null. Safe to call from a Server Component — cookies() is readable
 * anywhere, only setting requires a Server Action/Route Handler/proxy. */
export async function getSessionUserId(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/** Sets the session cookie. Callable only from a Server Action, Route
 * Handler, or proxy.ts — calling this from a Server Component render
 * throws, by Next's own design, same as it would for a raw cookies().set(). */
export async function setSessionCookie(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_LIFETIME_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
