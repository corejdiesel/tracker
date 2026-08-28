"use client";

import { useRef, useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/primitives";
import { selectClass } from "@/components/ui/CreatePanel";
import { createClient } from "@/lib/supabase/client";
import { ARTEFACT_BUCKET } from "@/lib/db/constants";
import { recordArtefact } from "@/lib/db/actions";
import type { ProjectWithClient } from "@/lib/db/types";

const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"];

/**
 * Uploads straight from the browser to private storage, then records the row
 * through a server action. The bytes never pass through the action — a
 * screenshot would exceed the body limit and there is nothing to gain by
 * proxying it.
 *
 * Accepts a paste as well as a file pick: screenshotting and pressing ⌘V is
 * the fastest path from "I just did the thing" to "it is logged".
 */
export function ArtefactUpload({
  projects,
  ownerId,
}: {
  projects: ProjectWithClient[];
  ownerId: string;
}) {
  const [status, setStatus] = useState<"idle" | "uploading" | "error" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function upload(file: File, projectId: string, caption: string) {
    if (!ACCEPTED.includes(file.type)) {
      setStatus("error");
      setMessage(`${file.type || "That file type"} isn't accepted — images and PDFs only.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setStatus("error");
      setMessage("That file is over 20 MB. Compress it and try again.");
      return;
    }

    setStatus("uploading");
    setMessage(null);

    // Path must start with the owner id — storage RLS keys on that segment.
    const extension = file.name.split(".").pop() ?? "png";
    const path = `${ownerId}/${projectId}/${crypto.randomUUID()}.${extension}`;

    const supabase = createClient();
    const { error } = await supabase.storage.from(ARTEFACT_BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    const result = await recordArtefact({
      projectId,
      storagePath: path,
      caption: caption || null,
      byteSize: file.size,
    });

    if (result.error) {
      setStatus("error");
      setMessage(result.error);
      return;
    }

    setStatus("done");
    setMessage("Added to the log.");
    formRef.current?.reset();
  }

  function currentSelections(): { projectId: string; caption: string } | null {
    const form = formRef.current;
    if (!form) return null;
    const data = new FormData(form);
    const projectId = String(data.get("project_id") ?? "");
    if (!projectId) {
      setStatus("error");
      setMessage("Pick a project first.");
      return null;
    }
    return { projectId, caption: String(data.get("caption") ?? "") };
  }

  if (projects.length === 0) return null;

  return (
    <form
      ref={formRef}
      className="flex flex-wrap items-end gap-3"
      onPaste={(event) => {
        const file = event.clipboardData.files[0];
        if (!file) return;
        event.preventDefault();
        const selections = currentSelections();
        if (selections) void upload(file, selections.projectId, selections.caption);
      }}
      onSubmit={(event) => event.preventDefault()}
    >
      <div className="min-w-44 flex-1">
        <Field label="Project">
          <select className={selectClass} name="project_id" defaultValue="">
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
        <Field label="Caption" hint="Paste a screenshot anywhere in this row, or pick a file.">
          <input className={inputClass} name="caption" placeholder="Homepage, second pass" />
        </Field>
      </div>

      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept={ACCEPTED.join(",")}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const selections = currentSelections();
          if (selections) void upload(file, selections.projectId, selections.caption);
          event.target.value = "";
        }}
      />

      <Button
        type="button"
        variant="ghost"
        className="h-9"
        disabled={status === "uploading"}
        onClick={() => fileRef.current?.click()}
      >
        {status === "uploading" ? "Uploading…" : "Add a screenshot"}
      </Button>

      {message ? (
        <p
          role="status"
          className={`w-full text-sm ${status === "error" ? "text-danger" : "text-ink-muted"}`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
