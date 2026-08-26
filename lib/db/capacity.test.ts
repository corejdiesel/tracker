import { describe, expect, it } from "vitest";
import { WORKING_DAYS_PER_WEEK, capacityByWeek, weekStart } from "./capacity";
import type { EngagementWindow } from "./types";

const win = (over: Partial<EngagementWindow>): EngagementWindow => ({
  id: "1", project_id: "p", starts_on: "2026-08-24", ends_on: "2026-08-28",
  days_committed: 5, note: null, ...over,
});

describe("weekStart", () => {
  it("returns the same day for a Monday", () =>
    expect(weekStart("2026-08-24")).toBe("2026-08-24"));
  it("walks back from midweek", () =>
    expect(weekStart("2026-08-26")).toBe("2026-08-24"));
  it("treats Sunday as the end of its week, not the start", () =>
    expect(weekStart("2026-08-30")).toBe("2026-08-24"));
  it("crosses a month boundary", () =>
    expect(weekStart("2026-09-02")).toBe("2026-08-31"));
});

describe("capacityByWeek", () => {
  it("returns one bucket per requested week, starting on a Monday", () => {
    const weeks = capacityByWeek([], "2026-08-26", 4);
    expect(weeks).toHaveLength(4);
    expect(weeks.map((w) => w.startsOn)).toEqual([
      "2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14",
    ]);
    expect(weeks.every((w) => w.committed === 0)).toBe(true);
  });

  it("puts a single full week's booking in one bucket", () => {
    const weeks = capacityByWeek([win({})], "2026-08-24", 2);
    expect(weeks[0]!.committed).toBe(5);
    expect(weeks[1]!.committed).toBe(0);
  });

  it("splits a window that straddles two weeks, over working days only", () => {
    // Thu 27 Aug → Wed 2 Sep spans 7 calendar days but only 5 working ones:
    // Thu, Fri | Mon, Tue, Wed. Five committed days spread one per working day.
    const weeks = capacityByWeek(
      [win({ starts_on: "2026-08-27", ends_on: "2026-09-02", days_committed: 5 })],
      "2026-08-24",
      2
    );
    expect(weeks[0]!.committed).toBe(2);
    expect(weeks[1]!.committed).toBe(3);
  });

  it("never books work on a weekend", () => {
    // Sat 29 → Sun 30 Aug has no working days at all.
    const weeks = capacityByWeek(
      [win({ starts_on: "2026-08-29", ends_on: "2026-08-30", days_committed: 2 })],
      "2026-08-24",
      1
    );
    expect(weeks[0]!.committed).toBe(0);
  });

  it("loads a Friday-to-Monday booking onto the two working days it touches", () => {
    const weeks = capacityByWeek(
      [win({ starts_on: "2026-08-28", ends_on: "2026-08-31", days_committed: 2 })],
      "2026-08-24",
      2
    );
    expect(weeks[0]!.committed).toBe(1); // Friday
    expect(weeks[1]!.committed).toBe(1); // Monday
  });

  it("sums overlapping windows so overcommitment is visible", () => {
    const weeks = capacityByWeek(
      [win({ days_committed: 4 }), win({ id: "2", days_committed: 3 })],
      "2026-08-24",
      1
    );
    expect(weeks[0]!.committed).toBe(7);
    expect(weeks[0]!.committed).toBeGreaterThan(WORKING_DAYS_PER_WEEK);
  });

  it("ignores the part of a window outside the horizon", () => {
    const weeks = capacityByWeek(
      [win({ starts_on: "2026-08-24", ends_on: "2026-09-06", days_committed: 14 })],
      "2026-08-24",
      1
    );
    // Only the first week's 7 days land inside the single-week horizon.
    expect(weeks[0]!.committed).toBe(7);
  });

  it("ignores a window whose dates are inverted rather than counting it negatively", () => {
    const weeks = capacityByWeek(
      [win({ starts_on: "2026-08-28", ends_on: "2026-08-24", days_committed: 5 })],
      "2026-08-24",
      1
    );
    expect(weeks[0]!.committed).toBe(0);
  });
});
