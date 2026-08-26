"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { safeNext } from "@/lib/routes";

const credentials = z.object({
  email: z.email("That doesn't look like an email address."),
  password: z.string().min(1, "Enter your password."),
  next: z.string().optional(),
});

export interface LoginState {
  error?: string;
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

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately not distinguishing "no such user" from "wrong password".
    return { error: "That email and password don't match." };
  }

  redirect(safeNext(parsed.data.next));
}

export async function signOut(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/login");
}
