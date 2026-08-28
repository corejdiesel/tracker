"use client";

import { useActionState, useEffect, useState } from "react";
import { Button, Field, inputClass } from "@/components/ui/primitives";
import { selectClass } from "@/components/ui/CreatePanel";
import { discardTimer, startTimer, stopTimer, type FormState } from "@/lib/db/actions";
import { elapsedMinutes, formatDuration } from "@/lib/db/time";
import type { ProjectWithClient, RunningTimer } from "@/lib/db/types";

export function Timer({
  timer,
  projects,
}: {
  timer: RunningTimer | null;
  projects: ProjectWithClient[];
}) {
  if (timer) {
    const project = projects.find((p) => p.id === timer.project_id);
    return <RunningTimerPanel timer={timer} projectName={project?.name ?? "Unknown project"} />;
  }
  return <StartTimerPanel projects={projects} />;
}

function StartTimerPanel({ projects }: { projects: ProjectWithClient[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(startTimer, {});

  if (projects.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Add a project before tracking time against it.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1">
        <Field label="Project">
          <select className={selectClass} name="project_id" required defaultValue="">
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

      <div className="min-w-48 flex-2">
        <Field label="What are you doing?">
          <input className={inputClass} name="note" placeholder="Homepage animation pass" />
        </Field>
      </div>

      <Button type="submit" disabled={pending} className="h-9">
        {pending ? "Starting…" : "Start timer"}
      </Button>

      {state.error ? (
        <p role="alert" className="w-full text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function RunningTimerPanel({ timer, projectName }: { timer: RunningTimer; projectName: string }) {
  // Recomputed from started_at each tick rather than counted up, so the
  // display stays correct if the tab sleeps or the machine suspends.
  const [minutes, setMinutes] = useState(() => elapsedMinutes(timer.started_at));

  useEffect(() => {
    const id = setInterval(() => setMinutes(elapsedMinutes(timer.started_at)), 15_000);
    return () => clearInterval(id);
  }, [timer.started_at]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-baseline gap-3">
        <span className="font-display text-3xl leading-none text-ink tabular" aria-live="polite">
          {formatDuration(minutes)}
        </span>
        <span className="min-w-0 text-sm text-ink-muted">
          {projectName}
          {timer.note ? <span className="text-ink-faint"> · {timer.note}</span> : null}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <form action={stopTimer}>
          <Button type="submit">Stop and log</Button>
        </form>
        <form action={discardTimer}>
          <Button type="submit" variant="danger">
            Discard
          </Button>
        </form>
      </div>
    </div>
  );
}
