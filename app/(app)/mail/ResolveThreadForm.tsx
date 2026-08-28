"use client";

import { useActionState } from "react";
import { Button, Field, inputClass } from "@/components/ui/primitives";
import { selectClass } from "@/components/ui/CreatePanel";
import { resolveThread, type FormState } from "@/lib/db/actions";
import type { ProjectWithClient } from "@/lib/db/types";

export function ResolveThreadForm({
  threadId,
  clients,
  projects,
}: {
  threadId: string;
  clients: { id: string; name: string }[];
  projects: ProjectWithClient[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(resolveThread, {});

  return (
    <form action={action} className="flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-2">
      <input type="hidden" name="thread_id" value={threadId} />

      <div className="min-w-36">
        <Field label="Client">
          <select className={selectClass} name="client_id" required defaultValue="">
            <option value="" disabled>Choose…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="min-w-36">
        <Field label="Project" hint="Optional.">
          <select className={selectClass} name="project_id" defaultValue="">
            <option value="">None</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
      </div>

      <div className="min-w-40">
        <Field label="Remember by" hint="Future mail matching this resolves itself.">
          <select className={inputClass} name="remember_by" defaultValue="address">
            <option value="address">This sender</option>
            <option value="domain">Anyone at this domain</option>
            <option value="just_this_once">Just this once</option>
          </select>
        </Field>
      </div>

      <Button type="submit" disabled={pending} className="h-9">
        {pending ? "Resolving…" : "Resolve"}
      </Button>

      {state.error ? <p className="w-full text-sm text-danger">{state.error}</p> : null}
    </form>
  );
}
