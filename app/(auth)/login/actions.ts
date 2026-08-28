"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { withoutUser } from "@/lib/db/client";
import { verifyPassword, hashPassword } from "@/lib/auth/password";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth/session";
import { safeNext } from "@/lib/routes";

const credentials = z.object({
  email: z.email("That doesn't look like an email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export interface LoginState {
  error?: string;
}

/**
 * A hash of a password nobody will ever type, verified when no account
 * matches the entered email — so a login attempt against a non-existent
 * address takes the same shape of work (a real scrypt computation) as one
 * against a real address with the wrong password, rather than returning
 * immediately and leaking "no such user" through response timing.
 */
let dummyHash: string | null = null;
async function getDummyHash(): Promise<string> {
  if (!dummyHash) dummyHash = await hashPassword("no-such-account-placeholder");
  return dummyHash;
}

export async function signIn(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = credentials.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    // Narrowed to a known app route by `safeNext` below, which is what
    // stops this becoming an open redirect.
    next: formData.get("next") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check your details." };
  }

  const conn = withoutUser();
  const rows = await conn.query<{ id: string; password_hash: string }>(
    `select id, password_hash from public.users where email = $1`,
    [parsed.data.email]
  );
  const user = rows[0];

  const valid = await verifyPassword(parsed.data.password, user?.password_hash ?? (await getDummyHash()));

  if (!user || !valid) {
    // Deliberately not distinguishing "no such user" from "wrong password".
    return { error: "That email and password don't match." };
  }

  await setSessionCookie(user.id);
  redirect(safeNext(parsed.data.next));
}

export async function signOut(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}
