import { Card, EmptyState } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/ui/page";
import { createServerSupabase } from "@/lib/supabase/server";
import { addDays, formatDateShort, todayIso } from "@/lib/dates";
import { capacityByWeek, WORKING_DAYS_PER_WEEK } from "@/lib/db/capacity";
import { listTimeEntries } from "@/lib/db/queries";
import { loggedByWeek } from "@/lib/db/time";
import type { EngagementWindow } from "@/lib/db/types";

export const metadata = { title: "Timetable · Freelance OS" };

export default async function TimetablePage() {
  const today = todayIso();
  const horizon = addDays(today, 8 * 7);

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("engagement_windows")
    .select("id,project_id,starts_on,ends_on,days_committed,note,projects(name)")
    .is("deleted_at", null)
    .lte("starts_on", horizon)
    .gte("ends_on", today)
    .order("starts_on");

  if (error) throw new Error(error.message);

  const windows = (data ?? []) as unknown as EngagementWindow[];
  const weeks = capacityByWeek(windows, today, 8);

  // Actual hours against the plan. Logged time is read from four weeks back so
  // weeks already underway show what really happened, not just what was booked.
  const entries = await listTimeEntries(addDays(today, -28));
  const actual = new Map(loggedByWeek(entries, today, 8).map((w) => [w.startsOn, w.logged]));

  return (
    <>
      <PageHeader
        title="Timetable"
        subtitle={`Committed days against ${WORKING_DAYS_PER_WEEK} available, eight weeks out. The inner bar is time actually logged.`}
      />

      <PageBody>
        <Card>
          {windows.length === 0 && entries.length === 0 ? (
            <EmptyState
              title="Nothing booked"
              description="Capacity is driven by engagement windows — the actual booked time on a project, not the project's overall date range. Add a window to a project and it appears here."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {weeks.map((week) => {
                const over = week.committed > WORKING_DAYS_PER_WEEK;
                const logged = actual.get(week.startsOn) ?? 0;
                const pct = (days: number) =>
                  Math.min(100, (days / WORKING_DAYS_PER_WEEK) * 100);

                return (
                  <li key={week.startsOn} className="flex items-center gap-4 px-4 py-3">
                    <span className="w-20 shrink-0 text-xs text-ink-faint tabular">
                      {formatDateShort(week.startsOn)}
                    </span>

                    <div
                      className="relative h-3 flex-1 overflow-hidden rounded-full bg-surface-sunken"
                      role="img"
                      aria-label={`${week.committed} of ${WORKING_DAYS_PER_WEEK} days committed, ${logged} logged`}
                    >
                      {/* Planned: the full-height bar. */}
                      <div
                        className={over ? "h-full bg-danger/40" : "h-full bg-accent/35"}
                        style={{ width: `${pct(week.committed)}%` }}
                      />
                      {/* Actual: a solid inner bar, so the gap between what was
                          booked and what was worked is the thing you read. */}
                      {logged > 0 ? (
                        <div
                          className="absolute inset-y-0.5 left-0 rounded-full bg-accent"
                          style={{ width: `${pct(logged)}%` }}
                        />
                      ) : null}
                    </div>

                    <span
                      className={`w-32 shrink-0 text-right text-sm tabular ${over ? "text-danger" : "text-ink-muted"}`}
                    >
                      {logged > 0 ? `${logged} / ` : ""}
                      {week.committed} of {WORKING_DAYS_PER_WEEK}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
