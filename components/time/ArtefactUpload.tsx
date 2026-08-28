"use client";

import { Field, inputClass } from "@/components/ui/primitives";
import { selectClass } from "@/components/ui/CreatePanel";
import type { ProjectWithClient } from "@/lib/db/types";

/**
 * DEFERRED: screenshot upload needs a file storage provider, and Neon has
 * none — Supabase Storage's private-bucket-plus-signed-URL model doesn't
 * carry over. This renders the same fields, disabled, so the layout and
 * intent stay visible rather than the section just vanishing, but nothing
 * here calls recordArtefact yet. See lib/db/queries.ts's signArtefacts and
 * lib/db/actions.ts's recordArtefact for the matching DEFERRED notes, and
 * the Notion action list for the provider decision (R2 / S3 / Vercel Blob).
 */
export function ArtefactUpload({ projects }: { projects: ProjectWithClient[] }) {
  if (projects.length === 0) return null;

  return (
    <div className="flex flex-wrap items-end gap-3 opacity-60">
      <div className="min-w-44 flex-1">
        <Field label="Project">
          <select className={selectClass} disabled defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.clients?.name ? `${p.clients.name} — ${p.name}` : p.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="min-w-44 flex-2">
        <Field label="Caption" hint="Screenshot upload isn&rsquo;t wired up yet — storage provider still to be chosen.">
          <input className={inputClass} disabled placeholder="Homepage, second pass" />
        </Field>
      </div>

      <p role="status" className="w-full text-sm text-ink-muted">
        Screenshot upload is disabled for now — this needs a file storage provider, which hasn&rsquo;t been picked yet.
      </p>
    </div>
  );
}
