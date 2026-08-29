import { describe, expect, it } from "vitest";
import { currentVatPeriod, quarterForDate, recentVatPeriods, vatDueDate, vatPeriod } from "./periods";

describe("vatPeriod", () => {
  it("builds calendar quarters with correct boundaries", () => {
    expect(vatPeriod(2026, 1)).toMatchObject({ startsOn: "2026-01-01", endsOn: "2026-03-31" });
    expect(vatPeriod(2026, 2)).toMatchObject({ startsOn: "2026-04-01", endsOn: "2026-06-30" });
    expect(vatPeriod(2026, 3)).toMatchObject({ startsOn: "2026-07-01", endsOn: "2026-09-30" });
    expect(vatPeriod(2026, 4)).toMatchObject({ startsOn: "2026-10-01", endsOn: "2026-12-31" });
  });

  it("labels a period in HMRC's month-range style", () => {
    expect(vatPeriod(2026, 3).label).toBe("Jul–Sep 2026");
  });

  it("honours leap years for a Q1 end date", () => {
    expect(vatPeriod(2028, 1).endsOn).toBe("2028-03-31"); // 2028 is a leap year, Feb has 29 days but Q1 still ends 31 Mar
    expect(vatPeriod(2028, 1).startsOn).toBe("2028-01-01");
  });
});

describe("vatDueDate — one calendar month and 7 days after the period end", () => {
  it("matches gov.uk's own worked example: Q1 (ending 31 Mar) is due 7 May", () => {
    expect(vatDueDate("2026-03-31")).toBe("2026-05-07");
  });

  it("matches the commonly-cited Q3 example: ending 30 Sep is due 7 Nov", () => {
    // 30 Sep is already Sep's last day, so +1 calendar month lands on Oct's
    // last day (31 Oct), not literally "30 Oct" — this is the case that
    // breaks a naive same-day-of-month +1 month implementation.
    expect(vatDueDate("2026-09-30")).toBe("2026-11-07");
  });

  it("handles a December period end crossing into the next year", () => {
    expect(vatDueDate("2026-12-31")).toBe("2027-02-07");
  });

  it("clamps correctly when the next month is shorter — end of Jan into Feb", () => {
    // Not a real VAT quarter end, but proves the clamping logic generalises
    // rather than only working for quarter-end dates.
    expect(vatDueDate("2026-01-31")).toBe("2026-03-07"); // 31 Jan + 1 month -> 28 Feb (2026 not leap) + 7 days
  });
});

describe("quarterForDate", () => {
  it("maps every month to its calendar quarter", () => {
    expect(quarterForDate("2026-01-15")).toBe(1);
    expect(quarterForDate("2026-03-31")).toBe(1);
    expect(quarterForDate("2026-04-01")).toBe(2);
    expect(quarterForDate("2026-08-29")).toBe(3);
    expect(quarterForDate("2026-12-31")).toBe(4);
  });
});

describe("currentVatPeriod", () => {
  it("returns the period containing today", () => {
    expect(currentVatPeriod("2026-08-29")).toMatchObject({ year: 2026, quarter: 3 });
  });
});

describe("recentVatPeriods", () => {
  it("returns the requested count, newest first, stepping back a quarter at a time", () => {
    const periods = recentVatPeriods(4, "2026-08-29");
    expect(periods.map((p) => `${p.year}Q${p.quarter}`)).toEqual([
      "2026Q3", "2026Q2", "2026Q1", "2025Q4",
    ]);
  });

  it("steps back across a year boundary correctly", () => {
    const periods = recentVatPeriods(2, "2026-01-15");
    expect(periods.map((p) => `${p.year}Q${p.quarter}`)).toEqual(["2026Q1", "2025Q4"]);
  });

  it("stops early when registeredFrom is within the requested range", () => {
    // Registered partway through Q2 2026 — Q1 2026 and earlier shouldn't appear.
    const periods = recentVatPeriods(6, "2026-08-29", "2026-05-01");
    expect(periods.map((p) => `${p.year}Q${p.quarter}`)).toEqual(["2026Q3", "2026Q2"]);
  });
});
