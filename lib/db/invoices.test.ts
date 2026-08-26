import { describe, expect, it } from "vitest";
import {
  effectiveStatus, expectedBetween, medianPaymentLag, totalOverdue, totalOwed,
} from "./invoices";
import type { Invoice } from "./types";

const inv = (over: Partial<Invoice>): Invoice => ({
  id: "1", client_id: "c", project_id: null, number: "INV-1",
  issue_date: "2026-08-01", due_date: "2026-08-31",
  subtotal_pence: 400000, vat_pence: 80000, total_pence: 480000,
  status: "sent", paid_on: null, ...over,
});

describe("effectiveStatus", () => {
  it("derives overdue from the due date, not the stored column", () =>
    expect(effectiveStatus(inv({ status: "sent", due_date: "2026-08-01" }), "2026-08-26"))
      .toBe("overdue"));
  it("is not overdue on the due date itself", () =>
    expect(effectiveStatus(inv({ status: "sent", due_date: "2026-08-26" }), "2026-08-26"))
      .toBe("sent"));
  it("never re-opens a paid or written-off invoice", () => {
    expect(effectiveStatus(inv({ status: "paid", paid_on: "2026-08-10", due_date: "2026-08-01" }), "2026-08-26")).toBe("paid");
    expect(effectiveStatus(inv({ status: "written_off", due_date: "2026-08-01" }), "2026-08-26")).toBe("written_off");
  });
});

describe("totalOwed", () => {
  it("counts sent and overdue", () =>
    expect(totalOwed([inv({ status: "sent" }), inv({ status: "overdue" })])).toBe(BigInt(960000)));
  it("excludes draft, scheduled, paid and written off — the classic over-count", () => {
    const invoices = [
      inv({ status: "draft" }), inv({ status: "scheduled" }),
      inv({ status: "paid", paid_on: "2026-08-10" }), inv({ status: "written_off" }),
    ];
    expect(totalOwed(invoices)).toBe(BigInt(0));
  });
  it("is zero for an empty ledger", () => expect(totalOwed([])).toBe(BigInt(0)));
});

describe("totalOverdue", () => {
  it("counts only what is past due", () => {
    const invoices = [
      inv({ status: "sent", due_date: "2026-08-01", total_pence: 100000 }),
      inv({ status: "sent", due_date: "2026-09-30", total_pence: 500000 }),
    ];
    expect(totalOverdue(invoices, "2026-08-26")).toBe(BigInt(100000));
  });
});

describe("expectedBetween", () => {
  it("separates owed from merely scheduled", () => {
    const invoices = [
      inv({ status: "sent", due_date: "2026-09-15", total_pence: 100000 }),
      inv({ status: "scheduled", due_date: "2026-09-20", total_pence: 250000 }),
      inv({ status: "sent", due_date: "2026-12-01", total_pence: 999999 }),
    ];
    expect(expectedBetween(invoices, "2026-09-01", "2026-09-30"))
      .toEqual({ due: BigInt(100000), scheduled: BigInt(250000) });
  });
  it("includes invoices due on the window boundaries", () => {
    const invoices = [
      inv({ status: "sent", due_date: "2026-09-01", total_pence: 1000 }),
      inv({ status: "sent", due_date: "2026-09-30", total_pence: 1000 }),
    ];
    expect(expectedBetween(invoices, "2026-09-01", "2026-09-30").due).toBe(BigInt(2000));
  });
});

describe("medianPaymentLag", () => {
  it("says nothing when there is no history rather than guessing", () =>
    expect(medianPaymentLag([inv({ status: "sent" })])).toBeNull());
  it("takes the middle value for an odd count", () => {
    const invoices = [
      inv({ status: "paid", issue_date: "2026-01-01", paid_on: "2026-01-11" }),
      inv({ status: "paid", issue_date: "2026-02-01", paid_on: "2026-03-03" }),
      inv({ status: "paid", issue_date: "2026-03-01", paid_on: "2026-03-21" }),
    ];
    expect(medianPaymentLag(invoices)).toBe(20);
  });
  it("averages the middle pair for an even count", () => {
    const invoices = [
      inv({ status: "paid", issue_date: "2026-01-01", paid_on: "2026-01-11" }),
      inv({ status: "paid", issue_date: "2026-02-01", paid_on: "2026-02-21" }),
    ];
    expect(medianPaymentLag(invoices)).toBe(15);
  });
  it("resists one freak late payer, unlike a mean", () => {
    const invoices = [
      inv({ status: "paid", issue_date: "2026-01-01", paid_on: "2026-01-11" }),
      inv({ status: "paid", issue_date: "2026-02-01", paid_on: "2026-02-11" }),
      inv({ status: "paid", issue_date: "2026-03-01", paid_on: "2026-12-01" }),
    ];
    expect(medianPaymentLag(invoices)).toBe(10);
  });
});
