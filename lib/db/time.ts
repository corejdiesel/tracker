import { addDays } from "@/lib/dates";
import { weekStart } from "./capacity";
import type { TimeEntry } from "./types";

/**
 * A billable day. Used to convert logged minutes into day-equivalents so a
 * fixed fee can be compared against a day rate. 7½ hours is the assumption —
 * change it here and every derived figure moves with it.
 */
export const MINUTES_PER_WORKING_DAY = 450;

/** "3h 30m", "45m", "8h". Never a bare decimal — 3.5 reads as £3.50 at a glance. */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** Day-equivalents to one decimal place — a half day is meaningful, a hundredth is not. */
export function dayEquivalents(minutes: number): number {
  return Math.round((minutes / MINUTES_PER_WORKING_DAY) * 10) / 10;
}

export function totalMinutes(entries: readonly TimeEntry[]): number {
  return entries.reduce((total, entry) => total + entry.minutes, 0);
}

export function billableMinutes(entries: readonly TimeEntry[]): number {
  return entries.reduce((total, e) => total + (e.billable ? e.minutes : 0), 0);
}

/** Minutes a running timer has accumulated. Floors — a timer never rounds up. */
export function elapsedMinutes(startedAtIso: string, now: Date = new Date()): number {
  const elapsed = now.getTime() - new Date(startedAtIso).getTime();
  return elapsed <= 0 ? 0 : Math.floor(elapsed / 60_000);
}

export interface EffectiveRate {
  hourlyPence: bigint;
  /** What the fee works out at per day actually spent. */
  dayRatePence: bigint;
  days: number;
  minutes: number;
}

/**
 * What a fixed fee actually earned, given the time it consumed.
 *
 * This is the number that changes a decision: a £12,000 project that ate 22
 * days paid £545/day against a £750 quote, and the next quote should say so.
 *
 * ALL logged time counts, billable or not — non-billable hours are exactly
 * what erodes the rate, so excluding them would flatter the answer.
 * Returns null when there is no fee or no time; it does not guess.
 */
export function effectiveRate(
  feePence: bigint | null,
  minutes: number
): EffectiveRate | null {
  if (feePence === null || feePence <= BigInt(0) || minutes <= 0) return null;

  const asBigint = BigInt(minutes);
  return {
    hourlyPence: (feePence * BigInt(60)) / asBigint,
    dayRatePence: (feePence * BigInt(MINUTES_PER_WORKING_DAY)) / asBigint,
    days: dayEquivalents(minutes),
    minutes,
  };
}

export interface RateVerdict {
  /** Effective day rate minus the quoted one. Negative means the work underpaid. */
  deltaPence: bigint;
  direction: "above" | "below" | "on";
  /** Whole percent of the quoted rate. */
  percent: number;
}

/**
 * Effective rate against what was quoted. Returns null when there is nothing
 * to compare against, rather than treating a missing quote as zero.
 */
export function compareToQuoted(
  effective: EffectiveRate | null,
  quotedDayRatePence: bigint | null
): RateVerdict | null {
  if (!effective || quotedDayRatePence === null || quotedDayRatePence <= BigInt(0)) return null;

  const deltaPence = effective.dayRatePence - quotedDayRatePence;
  const percent = Number((deltaPence * BigInt(100)) / quotedDayRatePence);

  return {
    deltaPence,
    direction: deltaPence === BigInt(0) ? "on" : deltaPence > BigInt(0) ? "above" : "below",
    percent,
  };
}

export interface WeekLogged {
  startsOn: string;
  /** Day-equivalents actually logged in this week. */
  logged: number;
}

/**
 * Logged time bucketed by week, in the same shape and week alignment as
 * `capacityByWeek`, so the timetable can put planned against actual.
 */
export function loggedByWeek(
  entries: readonly TimeEntry[],
  from: string,
  weeks: number
): WeekLogged[] {
  const firstMonday = weekStart(from);

  const buckets = new Map<string, number>();
  for (let i = 0; i < weeks; i++) buckets.set(addDays(firstMonday, i * 7), 0);

  for (const entry of entries) {
    const bucket = weekStart(entry.worked_on);
    const current = buckets.get(bucket);
    if (current === undefined) continue; // outside the horizon
    buckets.set(bucket, current + entry.minutes);
  }

  return [...buckets.entries()].map(([startsOn, minutes]) => ({
    startsOn,
    logged: dayEquivalents(minutes),
  }));
}

/** Total minutes per project, for the projects list. */
export function minutesByProject(entries: readonly TimeEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    totals.set(entry.project_id, (totals.get(entry.project_id) ?? 0) + entry.minutes);
  }
  return totals;
}
