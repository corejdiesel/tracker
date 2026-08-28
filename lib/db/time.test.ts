import { describe, expect, it } from "vitest";
import {
  MINUTES_PER_WORKING_DAY, billableMinutes, compareToQuoted, dayEquivalents,
  effectiveRate, elapsedMinutes, formatDuration, loggedByWeek, minutesByProject,
  totalMinutes,
} from "./time";
import type { TimeEntry } from "./types";

const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: "1", project_id: "p1", task_id: null, worked_on: "2026-08-26",
  minutes: 210, note: null, billable: true, source: "manual", ...over,
});

describe("formatDuration", () => {
  it("reads as time, never as a decimal that could be mistaken for money", () => {
    expect(formatDuration(210)).toBe("3h 30m");
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(480)).toBe("8h");
    expect(formatDuration(0)).toBe("0m");
  });
  it("does not go negative", () => expect(formatDuration(-30)).toBe("0m"));
});

describe("dayEquivalents", () => {
  it("converts a full working day to 1", () =>
    expect(dayEquivalents(MINUTES_PER_WORKING_DAY)).toBe(1));
  it("rounds to a half-day's precision, not a hundredth", () => {
    expect(dayEquivalents(225)).toBe(0.5);
    expect(dayEquivalents(210)).toBe(0.5);
  });
});

describe("totals", () => {
  it("sums all logged minutes", () =>
    expect(totalMinutes([entry({ minutes: 210 }), entry({ minutes: 90 })])).toBe(300));
  it("separates billable from the rest", () => {
    const entries = [entry({ minutes: 210 }), entry({ minutes: 90, billable: false })];
    expect(totalMinutes(entries)).toBe(300);
    expect(billableMinutes(entries)).toBe(210);
  });
  it("is zero for no entries", () => expect(totalMinutes([])).toBe(0));
});

describe("elapsedMinutes", () => {
  const started = "2026-08-26T09:00:00.000Z";
  it("floors — a timer never rounds up", () => {
    expect(elapsedMinutes(started, new Date("2026-08-26T09:59:59.000Z"))).toBe(59);
    expect(elapsedMinutes(started, new Date("2026-08-26T10:00:00.000Z"))).toBe(60);
  });
  it("is zero at the moment it starts, and never negative from clock skew", () => {
    expect(elapsedMinutes(started, new Date(started))).toBe(0);
    expect(elapsedMinutes(started, new Date("2026-08-26T08:00:00.000Z"))).toBe(0);
  });
});

describe("effectiveRate", () => {
  it("says nothing rather than guessing when the fee or the time is missing", () => {
    expect(effectiveRate(null, 900)).toBeNull();
    expect(effectiveRate(BigInt(1200000), 0)).toBeNull();
    expect(effectiveRate(BigInt(0), 900)).toBeNull();
  });

  it("works out what a fixed fee actually paid per day", () => {
    // £12,000 over 22 working days.
    const rate = effectiveRate(BigInt(1200000), 22 * MINUTES_PER_WORKING_DAY);
    expect(rate).not.toBeNull();
    expect(rate!.days).toBe(22);
    expect(rate!.dayRatePence).toBe(BigInt(54545)); // £545.45
    expect(rate!.hourlyPence).toBe(BigInt(7272)); // £72.72
  });

  it("counts non-billable time too — that is what erodes the rate", () => {
    const billableOnly = effectiveRate(BigInt(1200000), 10 * MINUTES_PER_WORKING_DAY);
    const withOverrun = effectiveRate(BigInt(1200000), 20 * MINUTES_PER_WORKING_DAY);
    expect(withOverrun!.dayRatePence).toBeLessThan(billableOnly!.dayRatePence);
  });
});

describe("compareToQuoted", () => {
  const overrun = effectiveRate(BigInt(1200000), 22 * MINUTES_PER_WORKING_DAY);

  it("reports how far below the quoted rate the work landed", () => {
    const verdict = compareToQuoted(overrun, BigInt(75000)); // £750/day quoted
    expect(verdict).not.toBeNull();
    expect(verdict!.direction).toBe("below");
    expect(verdict!.deltaPence).toBe(BigInt(54545 - 75000));
    expect(verdict!.percent).toBe(-27);
  });

  it("reports beating the quote", () => {
    const quick = effectiveRate(BigInt(1200000), 10 * MINUTES_PER_WORKING_DAY);
    const verdict = compareToQuoted(quick, BigInt(75000));
    expect(verdict!.direction).toBe("above");
    expect(verdict!.percent).toBe(60);
  });

  it("recognises landing exactly on the quote", () => {
    const exact = effectiveRate(BigInt(75000) * BigInt(10), 10 * MINUTES_PER_WORKING_DAY);
    expect(compareToQuoted(exact, BigInt(75000))!.direction).toBe("on");
  });

  it("does not treat a missing quote as zero", () => {
    expect(compareToQuoted(overrun, null)).toBeNull();
    expect(compareToQuoted(overrun, BigInt(0))).toBeNull();
    expect(compareToQuoted(null, BigInt(75000))).toBeNull();
  });
});

describe("loggedByWeek", () => {
  it("aligns to the same Mondays as the planned-capacity buckets", () => {
    const weeks = loggedByWeek([], "2026-08-26", 3);
    expect(weeks.map((w) => w.startsOn)).toEqual(["2026-08-24", "2026-08-31", "2026-09-07"]);
  });

  it("buckets entries into their week, as day-equivalents", () => {
    const entries = [
      entry({ worked_on: "2026-08-25", minutes: MINUTES_PER_WORKING_DAY }),
      entry({ worked_on: "2026-08-27", minutes: MINUTES_PER_WORKING_DAY }),
      entry({ worked_on: "2026-09-01", minutes: MINUTES_PER_WORKING_DAY }),
    ];
    const weeks = loggedByWeek(entries, "2026-08-24", 2);
    expect(weeks[0]!.logged).toBe(2);
    expect(weeks[1]!.logged).toBe(1);
  });

  it("ignores entries outside the horizon", () => {
    const entries = [entry({ worked_on: "2025-01-01", minutes: 480 })];
    expect(loggedByWeek(entries, "2026-08-24", 2).every((w) => w.logged === 0)).toBe(true);
  });
});

describe("minutesByProject", () => {
  it("totals per project", () => {
    const totals = minutesByProject([
      entry({ project_id: "a", minutes: 120 }),
      entry({ project_id: "a", minutes: 60 }),
      entry({ project_id: "b", minutes: 30 }),
    ]);
    expect(totals.get("a")).toBe(180);
    expect(totals.get("b")).toBe(30);
    expect(totals.get("c")).toBeUndefined();
  });
});
