import Image from "next/image";
import { Badge, Card, CardHeader, EmptyState, Field, Money, inputClass } from "@/components/ui/primitives";
import { CreatePanel, selectClass } from "@/components/ui/CreatePanel";
import { PageBody, PageHeader } from "@/components/ui/page";
import { Timer } from "@/components/time/Timer";
import { ArtefactUpload } from "@/components/time/ArtefactUpload";
import { logTime } from "@/lib/db/actions";
import {
  getRunningTimer, listArtefacts, listProjects, listTimeEntries, signArtefacts,
} from "@/lib/db/queries";
import { getUser } from "@/lib/supabase/server";
import {
  compareToQuoted, effectiveRate, formatDuration, minutesByProject, totalMinutes,
} from "@/lib/db/time";
import { formatMoney, formatMoneySigned, toPence } from "@/lib/money";
import { addDays, formatDate, todayIso } from "@/lib/dates";
import type { TimeEntryWithProject, WorkArtefact } from "@/lib/db/types";

export const metadata = { title: "Time · Freelance OS" };

export default async function TimePage() {
  const today = todayIso();
  const since = addDays(today, -28);

  const [user, timer, projects, entries, artefacts] = await Promise.all([
    getUser(),
    getRunningTimer(),
    listProjects(),
    listTimeEntries(since),
    listArtefacts(),
  ]);

  const signed = await signArtefacts(artefacts);
  const byProject = minutesByProject(entries);
  const artefactsByEntry = groupBy(artefacts, (a) => a.time_entry_id);

  const loggedToday = totalMinutes(entries.filter((e) => e.worked_on === today));
  const loggedThisPeriod = totalMinutes(entries);

  const days = groupBy(entries, (e) => e.worked_on);
  const dayKeys = [...days.keys()].sort((a, b) => b.localeCompare(a));

  // Live projects with a fee and logged time — the ones where an effective
  // rate is a real number rather than a division by nothing.
  const rates = projects
    .filter((p) => p.fee_pence !== null && (byProject.get(p.id) ?? 0) > 0)
    .map((project) => {
      const minutes = byProject.get(project.id) ?? 0;
      const rate = effectiveRate(toPence(project.fee_pence), minutes);
      const quoted = project.day_rate_pence !== null ? toPence(project.day_rate_pence) : null;
      return { project, rate, verdict: compareToQuoted(rate, quoted) };
    });

  return (
    <>
      <PageHeader
        title="Time"
        subtitle={`${formatDuration(loggedToday)} today · ${formatDuration(loggedThisPeriod)} in the last 28 days`}
      />

      <PageBody>
        <Card>
          <CardHeader title="Timer" />
          <div className="px-4 py-4">
            <Timer timer={timer} projects={projects} />
          </div>
        </Card>

        {rates.length > 0 ? (
          <Card>
            <CardHeader title="What the work actually paid" />
            <ul className="divide-y divide-[var(--border)]">
              {rates.map(({ project, rate, verdict }) => (
                <li key={project.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{project.name}</p>
                    <p className="text-xs text-ink-faint">
                      {formatMoney(toPence(project.fee_pence))} over {rate?.days ?? 0} days
                      {project.day_rate_pence !== null
                        ? ` · quoted ${formatMoney(toPence(project.day_rate_pence))}/day`
                        : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money size="sm" tone={verdict?.direction === "below" ? "danger" : "default"}>
                      {`${formatMoney(rate?.dayRatePence ?? BigInt(0))}/day`}
                    </Money>
                    {verdict && verdict.direction !== "on" ? (
                      <p
                        className={`text-xs tabular ${verdict.direction === "below" ? "text-danger" : "text-positive"}`}
                      >
                        {formatMoneySigned(verdict.deltaPence)} ({verdict.percent > 0 ? "+" : ""}
                        {verdict.percent}%)
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <CreatePanel action={logTime} label="Log time by hand" title="Log a session">
          <Field label="Project">
            <select className={selectClass} name="project_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.clients?.name ? `${p.clients.name} — ${p.name}` : p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input className={inputClass} name="worked_on" type="date" defaultValue={today} required />
          </Field>
          <Field label="Hours">
            <input className={inputClass} name="hours" type="number" min="0" max="24" step="1" defaultValue={0} />
          </Field>
          <Field label="Minutes">
            <input className={inputClass} name="minutes" type="number" min="0" max="59" step="5" defaultValue={0} />
          </Field>
          <Field label="What you did" hint="This is the log entry — it's what makes the hours reviewable later.">
            <input className={inputClass} name="note" placeholder="Homepage animation pass" />
          </Field>
          <Field label="Billable">
            <label className="flex h-9 items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="billable" defaultChecked />
              Counts towards the fee
            </label>
          </Field>
        </CreatePanel>

        <Card>
          <CardHeader title="Add to the log" />
          <div className="px-4 py-4">
            {user ? <ArtefactUpload projects={projects} ownerId={user.id} /> : null}
          </div>
        </Card>

        <Card>
          <CardHeader title="Sessions" />
          {entries.length === 0 ? (
            <EmptyState
              title="Nothing logged in the last 28 days"
              description="Start a timer or log a session by hand. Time against a fixed-fee project is what turns the fee into an effective day rate — which is the number worth knowing before you quote the next one."
            />
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {dayKeys.map((day) => {
                const dayEntries = days.get(day) ?? [];
                return (
                  <section key={day}>
                    <header className="flex items-baseline justify-between gap-4 bg-surface-sunken px-4 py-2">
                      <h3 className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">
                        {formatDate(day)}
                      </h3>
                      <span className="text-xs text-ink-faint tabular">
                        {formatDuration(totalMinutes(dayEntries))}
                      </span>
                    </header>

                    <ul className="divide-y divide-[var(--border)]">
                      {dayEntries.map((entry) => (
                        <SessionRow
                          key={entry.id}
                          entry={entry}
                          artefacts={artefactsByEntry.get(entry.id) ?? []}
                          signed={signed}
                        />
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent work" />
          {artefacts.length === 0 ? (
            <EmptyState
              title="No screenshots yet"
              description="Paste or upload a screenshot against a project and it lands here — a visual record of what each session produced, and evidence of what was agreed and when."
            />
          ) : (
            <ul className="grid gap-3 px-4 py-4 sm:grid-cols-3 lg:grid-cols-5">
              {artefacts.slice(0, 15).map((artefact) => (
                <ArtefactTile key={artefact.id} artefact={artefact} signed={signed} />
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}

function SessionRow({
  entry,
  artefacts,
  signed,
}: {
  entry: TimeEntryWithProject;
  artefacts: WorkArtefact[];
  signed: Map<string, string>;
}) {
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm text-ink">
          {entry.projects?.name ?? "Unknown project"}
          {entry.projects?.clients?.name ? (
            <span className="text-ink-faint"> · {entry.projects.clients.name}</span>
          ) : null}
        </p>
        {entry.note ? <p className="text-xs text-ink-muted">{entry.note}</p> : null}

        {artefacts.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {artefacts.map((artefact) => (
              <ArtefactTile key={artefact.id} artefact={artefact} signed={signed} compact />
            ))}
          </ul>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!entry.billable ? <Badge>Non-billable</Badge> : null}
        {entry.source !== "manual" ? <Badge tone="accent">{entry.source}</Badge> : null}
        <span className="text-sm text-ink tabular">{formatDuration(entry.minutes)}</span>
      </div>
    </li>
  );
}

function ArtefactTile({
  artefact,
  signed,
  compact = false,
}: {
  artefact: WorkArtefact;
  signed: Map<string, string>;
  compact?: boolean;
}) {
  const href = artefact.url ?? (artefact.storage_path ? signed.get(artefact.storage_path) : null);
  const size = compact ? "h-14 w-20" : "h-24 w-full";

  return (
    <li className={compact ? "" : "flex flex-col gap-1.5"}>
      <a
        href={href ?? undefined}
        target="_blank"
        rel="noreferrer"
        className={`relative block overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-surface-sunken ${size}`}
        title={artefact.caption ?? undefined}
      >
        {href && artefact.kind !== "link" ? (
          <Image
            src={href}
            alt={artefact.caption ?? "Work screenshot"}
            fill
            unoptimized
            sizes="200px"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full items-center justify-center px-2 text-center text-2xs text-ink-faint">
            {artefact.kind === "link" ? "Link" : "Preview unavailable"}
          </span>
        )}
      </a>
      {!compact && artefact.caption ? (
        <p className="truncate text-xs text-ink-muted">{artefact.caption}</p>
      ) : null}
    </li>
  );
}

/** Group by a key, skipping items whose key is null. */
function groupBy<T, K>(items: readonly T[], key: (item: T) => K | null): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const existing = groups.get(k);
    if (existing) existing.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}
