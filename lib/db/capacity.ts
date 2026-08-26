import { addDays, daysBetween } from "@/lib/dates";
import type { EngagementWindow } from "./types";

/** A five-day week. Made a constant so it is one edit to make it configurable. */
export const WORKING_DAYS_PER_WEEK = 5;

export interface WeekCapacity {
  /** Monday of the week, ISO. */
  startsOn: string;
  /** Days committed across all engagement windows overlapping this week. */
  committed: number;
}

/** The Monday on or before an ISO date. */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const backToMonday = dow === 0 ? 6 : dow - 1;
  return addDays(iso, -backToMonday);
}

/** Monday–Friday. Committed days are working days, so weekends never absorb any. */
function isWorkingDay(iso: string): boolean {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow !== 0 && dow !== 6;
}

/**
 * Spread each engagement window's committed days evenly across the WORKING
 * days it spans, then bucket by week.
 *
 * Even spreading is a deliberate simplification: a window records *how many*
 * days are booked, not which ones. Until the app tracks specific booked days,
 * spreading is the honest reading — it answers "is this week overcommitted?"
 * without inventing a schedule nobody entered. Weekends are excluded so a
 * Thursday-to-Wednesday booking does not silently place work on a Saturday.
 */
export function capacityByWeek(
  windows: readonly EngagementWindow[],
  from: string,
  weeks: number
): WeekCapacity[] {
  const firstMonday = weekStart(from);

  const buckets = new Map<string, number>();
  for (let i = 0; i < weeks; i++) {
    buckets.set(addDays(firstMonday, i * 7), 0);
  }

  for (const window of windows) {
    const span = daysBetween(window.starts_on, window.ends_on) + 1;
    if (span <= 0) continue;

    const workingDays: string[] = [];
    for (let offset = 0; offset < span; offset++) {
      const day = addDays(window.starts_on, offset);
      if (isWorkingDay(day)) workingDays.push(day);
    }

    // A window falling entirely on a weekend has nowhere to put its days.
    if (workingDays.length === 0) continue;

    const perDay = window.days_committed / workingDays.length;

    for (const day of workingDays) {
      const bucket = weekStart(day);
      const current = buckets.get(bucket);
      if (current === undefined) continue; // outside the horizon
      buckets.set(bucket, current + perDay);
    }
  }

  return [...buckets.entries()].map(([startsOn, committed]) => ({
    startsOn,
    // One decimal place — a half day is meaningful, a hundredth is noise.
    committed: Math.round(committed * 10) / 10,
  }));
}
