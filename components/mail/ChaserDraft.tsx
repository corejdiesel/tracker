"use client";

import { useState } from "react";
import { Button } from "@/components/ui/primitives";

/**
 * Shows a drafted chaser and lets Joe copy it — never sends anything.
 * §8: nothing leaves the machine on his behalf without an explicit
 * confirmation, and "confirmation" here means he pastes it himself; there
 * is no send action anywhere in this component, on purpose, not because
 * Gmail isn't wired up yet.
 */
export function ChaserDraft({ subject, body }: { subject: string; body: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!open) {
    return (
      <Button variant="ghost" onClick={() => setOpen(true)} className="h-7 text-xs">
        Draft a chaser
      </Button>
    );
  }

  return (
    <div className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-sunken p-3">
      <p className="text-xs font-medium text-ink">{subject}</p>
      <pre className="mt-2 whitespace-pre-wrap font-sans text-xs text-ink-muted">{body}</pre>
      <div className="mt-2 flex items-center gap-2">
        <Button
          variant="ghost"
          className="h-7 text-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <Button variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
          Hide
        </Button>
      </div>
    </div>
  );
}
