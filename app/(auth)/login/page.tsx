import type { Metadata } from "next";
import { isAppRoute } from "@/lib/routes";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Freelance OS" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="font-display text-3xl leading-none text-ink">Freelance OS</h1>
        <p className="text-sm text-ink-muted">Work, money and tax in one place.</p>
      </div>
      <LoginForm next={isAppRoute(next) ? next : undefined} />
    </main>
  );
}
