import { describe, expect, it } from "vitest";
import { advance, annualPence, committedBetween, monthlyBurn, monthlyPence } from "./costs";
import type { RecurringCost } from "./types";

const cost = (over: Partial<RecurringCost>): RecurringCost => ({
  id: "1", vendor: "Vendor", amount_pence: 1000, cadence: "monthly",
  next_charge_on: "2026-09-01", category_slug: "software", cancel_by: null,
  dependency: "discretionary", last_reviewed_on: null, active: true, ...over,
});

describe("cadence normalisation", () => {
  it("leaves a monthly cost alone", () =>
    expect(monthlyPence(BigInt(2500), "monthly")).toBe(BigInt(2500)));
  it("divides quarterly by three and annual by twelve", () => {
    expect(monthlyPence(BigInt(30000), "quarterly")).toBe(BigInt(10000));
    expect(monthlyPence(BigInt(120000), "annual")).toBe(BigInt(10000));
  });
  it("floors rather than inventing a penny of burn", () =>
    expect(monthlyPence(BigInt(100), "annual")).toBe(BigInt(8)));
  it("annualises back the other way", () => {
    expect(annualPence(BigInt(2500), "monthly")).toBe(BigInt(30000));
    expect(annualPence(BigInt(30000), "quarterly")).toBe(BigInt(120000));
    expect(annualPence(BigInt(120000), "annual")).toBe(BigInt(120000));
  });
});

describe("monthlyBurn", () => {
  it("is zero with no costs", () => expect(monthlyBurn([])).toBe(BigInt(0)));
  it("sums mixed cadences on a common monthly basis", () => {
    const total = monthlyBurn([
      cost({ amount_pence: 2500, cadence: "monthly" }),
      cost({ amount_pence: 30000, cadence: "quarterly" }),
      cost({ amount_pence: 120000, cadence: "annual" }),
    ]);
    expect(total).toBe(BigInt(2500 + 10000 + 10000));
  });
  it("excludes cancelled costs", () =>
    expect(monthlyBurn([cost({ amount_pence: 5000, active: false })])).toBe(BigInt(0)));
});

describe("advance", () => {
  it("steps one month", () => expect(advance("2026-09-01", "monthly")).toBe("2026-10-01"));
  it("steps a quarter and a year", () => {
    expect(advance("2026-09-01", "quarterly")).toBe("2026-12-01");
    expect(advance("2026-09-01", "annual")).toBe("2027-09-01");
  });
  it("rolls over the year boundary", () =>
    expect(advance("2026-12-15", "monthly")).toBe("2027-01-15"));
  it("clamps to the end of a short month rather than overflowing", () => {
    expect(advance("2026-01-31", "monthly")).toBe("2026-02-28");
    expect(advance("2028-01-31", "monthly")).toBe("2028-02-29");
    expect(advance("2026-03-31", "monthly")).toBe("2026-04-30");
  });
});

describe("committedBetween", () => {
  it("counts each charge that falls inside the window", () => {
    const costs = [cost({ amount_pence: 2500, cadence: "monthly", next_charge_on: "2026-09-01" })];
    // Sep, Oct, Nov charges.
    expect(committedBetween(costs, "2026-09-01", "2026-11-30")).toBe(BigInt(7500));
  });
  it("includes a charge on the window's first and last day", () => {
    const costs = [cost({ amount_pence: 1000, cadence: "monthly", next_charge_on: "2026-09-01" })];
    expect(committedBetween(costs, "2026-09-01", "2026-09-01")).toBe(BigInt(1000));
  });
  it("ignores a cost whose next charge is after the window", () => {
    const costs = [cost({ next_charge_on: "2027-01-01" })];
    expect(committedBetween(costs, "2026-09-01", "2026-11-30")).toBe(BigInt(0));
  });
  it("ignores cancelled costs", () => {
    const costs = [cost({ active: false, next_charge_on: "2026-09-01" })];
    expect(committedBetween(costs, "2026-09-01", "2026-11-30")).toBe(BigInt(0));
  });
  it("terminates on an annual cost spanning years", () => {
    const costs = [cost({ amount_pence: 12000, cadence: "annual", next_charge_on: "2026-09-01" })];
    expect(committedBetween(costs, "2026-01-01", "2029-01-01")).toBe(BigInt(36000));
  });
});
