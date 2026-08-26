import { toPence } from "@/lib/money";
import { daysOverdue } from "@/lib/dates";
import type { Invoice, InvoiceStatus } from "./types";

/** Statuses that represent money genuinely owed to you right now. */
const OWED: readonly InvoiceStatus[] = ["sent", "overdue"];

/**
 * An invoice's *effective* status. `overdue` is derived from the due date
 * rather than trusted from the column, so the figure is right even if no job
 * has run to re-stamp the row.
 */
export function effectiveStatus(invoice: Invoice, today: string): InvoiceStatus {
  if (invoice.status === "sent" && daysOverdue(invoice.due_date, today) > 0) return "overdue";
  return invoice.status;
}

/** Total outstanding — sent or overdue, never draft, scheduled or written off. */
export function totalOwed(invoices: readonly Invoice[]): bigint {
  return invoices
    .filter((i) => OWED.includes(i.status))
    .reduce<bigint>((total, i) => total + toPence(i.total_pence), BigInt(0));
}

/** Of that, the part already past its due date. */
export function totalOverdue(invoices: readonly Invoice[], today: string): bigint {
  return invoices
    .filter((i) => OWED.includes(i.status) && daysOverdue(i.due_date, today) > 0)
    .reduce<bigint>((total, i) => total + toPence(i.total_pence), BigInt(0));
}

/**
 * Expected cash between two dates: what is owed and due in the window, plus
 * scheduled future invoices landing in it. Scheduled invoices are included
 * because pipeline forecasting is the point — but they are counted separately
 * so the UI can show them as less certain.
 */
export function expectedBetween(
  invoices: readonly Invoice[],
  from: string,
  to: string
): { due: bigint; scheduled: bigint } {
  let due = BigInt(0);
  let scheduled = BigInt(0);

  for (const invoice of invoices) {
    if (invoice.due_date < from || invoice.due_date > to) continue;
    const amount = toPence(invoice.total_pence);
    if (OWED.includes(invoice.status)) due += amount;
    else if (invoice.status === "scheduled") scheduled += amount;
  }

  return { due, scheduled };
}

/**
 * Median days from issue to payment across paid invoices — the client's
 * actual behaviour, which is what the forecast should use rather than their
 * stated terms. Returns null when there is not enough history to say.
 */
export function medianPaymentLag(invoices: readonly Invoice[]): number | null {
  const lags = invoices
    .filter((i) => i.status === "paid" && i.paid_on !== null)
    .map((i) => {
      const at = (iso: string) => {
        const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
        return Date.UTC(y, m - 1, d);
      };
      return Math.round((at(i.paid_on!) - at(i.issue_date)) / 86_400_000);
    })
    .sort((a, b) => a - b);

  if (lags.length === 0) return null;
  const mid = Math.floor(lags.length / 2);
  return lags.length % 2 === 1 ? lags[mid]! : Math.round((lags[mid - 1]! + lags[mid]!) / 2);
}
