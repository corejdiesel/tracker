"use client";

import { Button } from "@/components/ui/primitives";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-dvh flex-col items-start justify-center gap-3 px-6">
      <h1 className="font-display text-2xl text-danger">That didn&rsquo;t load</h1>
      <p className="max-w-prose text-sm text-ink-muted">
        {error.message || "Something went wrong fetching your data."}
      </p>
      {error.digest ? <p className="text-xs text-ink-faint">Reference: {error.digest}</p> : null}
      <Button variant="ghost" onClick={reset} className="mt-2">
        Try again
      </Button>
    </div>
  );
}
