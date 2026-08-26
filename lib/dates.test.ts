import { describe, expect, it } from "vitest";
import {
  addDays, currentTaxYear, daysBetween, daysOverdue, formatDate, formatDateShort,
  isIsoDate, relativeDays, taxYearForDate, taxYearRange, todayIso,
} from "./dates";

describe("tax year boundaries", () => {
  it("puts 6 April in the new tax year", () =>
    expect(taxYearForDate("2026-04-06")).toBe("2026-27"));
  it("puts 5 April in the old one", () =>
    expect(taxYearForDate("2026-04-05")).toBe("2025-26"));
  it("handles the turn of the calendar year", () => {
    expect(taxYearForDate("2026-12-31")).toBe("2026-27");
    expect(taxYearForDate("2027-01-01")).toBe("2026-27");
  });
  it("round-trips through taxYearRange", () => {
    const { start, end } = taxYearRange("2026-27");
    expect(start).toBe("2026-04-06");
    expect(end).toBe("2027-04-05");
    expect(taxYearForDate(start)).toBe("2026-27");
    expect(taxYearForDate(end)).toBe("2026-27");
    expect(taxYearForDate(addDays(end, 1))).toBe("2027-28");
  });
  it("does not shift the boundary for a viewer west of UTC", () => {
    // 6 April 00:30 in UTC+13 is still 5 April in UTC. The user's own calendar
    // date is what counts, so this must read as the 6th, not the 5th.
    const localSixth = new Date(2026, 3, 6, 0, 30);
    expect(todayIso(localSixth)).toBe("2026-04-06");
    expect(currentTaxYear(localSixth)).toBe("2026-27");
  });
});

describe("isIsoDate", () => {
  it("accepts a real date", () => expect(isIsoDate("2026-08-26")).toBe(true));
  it("rejects a malformed one", () => {
    for (const bad of ["26-08-2026", "2026-8-26", "2026/08/26", "", "today"]) {
      expect(isIsoDate(bad)).toBe(false);
    }
  });
  it("rejects a date that does not exist", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
  });
  it("accepts a real leap day and rejects a fake one", () => {
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
  });
});

describe("date arithmetic", () => {
  it("adds and subtracts days across a month boundary", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });
  it("crosses a leap day correctly", () => expect(addDays("2028-02-28", 1)).toBe("2028-02-29"));
  it("is unaffected by the BST transition", () => {
    // 26 Oct 2026 is the day the UK clocks go back. A naive local-time
    // implementation returns the same day twice here.
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(daysBetween("2026-10-24", "2026-10-27")).toBe(3);
  });
  it("counts days between, signed", () => {
    expect(daysBetween("2026-08-01", "2026-08-31")).toBe(30);
    expect(daysBetween("2026-08-31", "2026-08-01")).toBe(-30);
  });
});

describe("daysOverdue", () => {
  it("is zero on and before the due date", () => {
    expect(daysOverdue("2026-08-26", "2026-08-26")).toBe(0);
    expect(daysOverdue("2026-08-26", "2026-08-01")).toBe(0);
  });
  it("counts days past the due date", () =>
    expect(daysOverdue("2026-08-01", "2026-08-26")).toBe(25));
});

describe("formatting", () => {
  it("formats a date without a leading zero", () =>
    expect(formatDate("2026-08-06")).toBe("6 Aug 2026"));
  it("drops the year in short form", () =>
    expect(formatDateShort("2026-08-26")).toBe("26 Aug"));
  it("phrases deadlines relatively", () => {
    expect(relativeDays("2026-08-26", "2026-08-26")).toBe("today");
    expect(relativeDays("2026-08-27", "2026-08-26")).toBe("tomorrow");
    expect(relativeDays("2026-08-25", "2026-08-26")).toBe("yesterday");
    expect(relativeDays("2026-08-29", "2026-08-26")).toBe("in 3 days");
    expect(relativeDays("2026-08-20", "2026-08-26")).toBe("6 days ago");
  });
});
