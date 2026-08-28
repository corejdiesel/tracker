import { describe, expect, it } from "vitest";
import { draftInvoiceChaser } from "./chaser";

const base = {
  clientName: "Real Co",
  invoiceNumber: "INV-0042",
  dueDate: "2026-08-01",
  totalPence: BigInt(420000),
  medianPaymentLagDays: null,
};

describe("draftInvoiceChaser", () => {
  it("recomputes days late itself rather than trusting a caller-supplied number", () => {
    const draft = draftInvoiceChaser({ ...base, today: "2026-08-05" });
    expect(draft.daysLate).toBe(4);
  });

  it("uses a light touch in the first week", () => {
    const draft = draftInvoiceChaser({ ...base, today: "2026-08-05" });
    expect(draft.body).toContain("just a quick nudge".replace("just", "Just"));
    expect(draft.subject).not.toContain("Overdue:");
  });

  it("escalates tone between one and three weeks", () => {
    const draft = draftInvoiceChaser({ ...base, today: "2026-08-15" }); // 14 days
    expect(draft.body).toContain("Following up");
    expect(draft.body).toContain("14 days overdue");
  });

  it("marks the subject Overdue past three weeks", () => {
    const draft = draftInvoiceChaser({ ...base, today: "2026-08-25" }); // 24 days
    expect(draft.subject).toContain("Overdue:");
    expect(draft.body).toContain("24 days overdue");
  });

  it("always includes the invoice number and amount", () => {
    const draft = draftInvoiceChaser({ ...base, today: "2026-08-10" });
    expect(draft.body).toContain("INV-0042");
    expect(draft.body).toContain("£4,200.00");
  });

  it("flags a client running later than their own norm", () => {
    const draft = draftInvoiceChaser({
      ...base, today: "2026-08-20", medianPaymentLagDays: 5,
    });
    expect(draft.body).toContain("later than usual for Real Co");
  });

  it("does not flag a client who is late but still within their own norm", () => {
    const draft = draftInvoiceChaser({
      ...base, today: "2026-08-05", medianPaymentLagDays: 30,
    });
    expect(draft.body).not.toContain("later than usual");
  });

  it("says nothing about historical lateness when there is no payment history yet", () => {
    const draft = draftInvoiceChaser({ ...base, today: "2026-08-20", medianPaymentLagDays: null });
    expect(draft.body).not.toContain("later than usual");
  });

  it("never produces empty subject or body regardless of lateness", () => {
    for (const today of ["2026-08-01", "2026-08-02", "2026-09-01", "2026-12-01"]) {
      const draft = draftInvoiceChaser({ ...base, today });
      expect(draft.subject.length).toBeGreaterThan(0);
      expect(draft.body.length).toBeGreaterThan(0);
    }
  });
});
