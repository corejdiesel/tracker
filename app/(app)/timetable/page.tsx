import { Card, EmptyState } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/ui/page";
import { createServerSupabase } from "@/lib/supabase/server";
import { addDays, formatDateShort, todayIso } from "@/lib/dates";
import { capacityByWeek, WORKING_DAYS_PER_WEEK } from "@/lib/db/capacity";
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

  return (
    <>
      <PageHeader
        title="Timetable"
        subtitle={`Committed days against ${WORKING_DAYS_PER_WEEK} available, eight weeks out`}
      />

      <PageBody>
        <Card>
          {windows.length === 0 ? (
            <EmptyState
              title="Nothing booked"
              description="Capacity is driven by engagement windows — the actual booked time on a project, not the project's overall date range. Add a window to a project and it appears here."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {weeks.map((week) => {
                const over = week.committed > WORKING_DAYS_PER_WEEK;
                return (
                  <li key={week.startsOn} className="flex items-center gap-4 px-4 py-3">
                    <span className="w-20 shrink-0 text-xs text-ink-faint tabular">
                      {formatDateShort(week.startsOn)}
                    </span>

                    <div
                      className="h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken"
                      role="img"
                      aria-label={`${week.committed} of ${WORKING_DAYS_PER_WEEK} days committed`}
                    >
                      <div
                        className={over ? "h-full bg-danger" : "h-full bg-accent"}
                        style={{
                          width: `${Math.min(100, (week.committed / WORKING_DAYS_PER_WEEK) * 100)}%`,
                        }}
                      />
                    </div>

                    <span
                      className={`w-24 shrink-0 text-right text-sm tabular ${over ? "text-danger" : "text-ink-muted"}`}
                    >
                      {week.committed} / {WORKING_DAYS_PER_WEEK} days
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
