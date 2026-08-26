"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Button } from "./primitives";
import type { FormState } from "@/lib/db/actions";

/**
 * An inline create form. Collapsed by default so a list page stays a list;
 * opens in place rather than in a modal, because on a data-dense screen you
 * usually want to see what you're adding to.
 */
export function CreatePanel({
  action,
  label,
  title,
  children,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  label: string;
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<FormState, FormData>(action, {});
  const formRef = useRef<HTMLFormElement>(null);
  const succeeded = useRef(false);

  // A submit that returns no error succeeded: clear the form and close up.
  useEffect(() => {
    if (pending) {
      succeeded.current = true;
      return;
    }
    if (succeeded.current && !state.error) {
      formRef.current?.reset();
      setOpen(false);
    }
    succeeded.current = false;
  }, [pending, state]);

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        {label}
      </Button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-surface p-4 shadow-[var(--shadow-card)]"
    >
      <h2 className="mb-4 text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">
        {title}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>

      {state.error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export const selectClass =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-surface px-2.5 text-base text-ink";
