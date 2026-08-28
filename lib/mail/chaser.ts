import { daysOverdue, formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";

/**
 * Drafts an overdue-invoice chaser. Returns a subject and body ONLY — this
 * module has no way to send anything, by construction, which is the point:
 * §8 is explicit that nothing leaves the machine on Joe's behalf without an
 * explicit confirmation. Whatever calls this writes the result into a
 * `mail_suggestions` row (kind='invoice_chaser', status='pending') or a
 * Gmail draft; either way a human presses send.
 */
export interface ChaserInput {
  clientName: string;
  invoiceNumber: string;
  dueDate: string;
  totalPence: bigint;
  today: string;
  /** From lib/db/invoices.ts's medianPaymentLag — this client's own
   * behaviour, not their stated terms. Null when there's no payment
   * history yet to judge by. */
  medianPaymentLagDays: number | null;
}

export interface ChaserDraft {
  subject: string;
  body: string;
  /** How overdue, for the UI to show alongside the draft — recomputed here
   * rather than trusted from the caller, so the tone and the displayed
   * number can never disagree. */
  daysLate: number;
}

/**
 * Tone escalates with lateness, and factors in whether this client is
 * usually slow anyway — a client who reliably pays late but always pays
 * gets a lighter touch than one who's now later than their own norm.
 */
export function draftInvoiceChaser(input: ChaserInput): ChaserDraft {
  const daysLate = daysOverdue(input.dueDate, input.today);
  const amount = formatMoney(input.totalPence);
  const dueDate = formatDate(input.dueDate);

  const runningLate =
    input.medianPaymentLagDays !== null && daysLate > input.medianPaymentLagDays;

  let body: string;

  if (daysLate <= 7) {
    body =
      `Hi,\n\nJust a quick nudge on invoice ${input.invoiceNumber} for ${amount}, ` +
      `due ${dueDate} — it looks like it hasn't come through yet. Could you let me ` +
      `know if it's in progress?\n\nThanks,\n`;
  } else if (daysLate <= 21) {
    body =
      `Hi,\n\nFollowing up on invoice ${input.invoiceNumber} for ${amount}, which was ` +
      `due ${dueDate} and is now ${daysLate} days overdue. Could you give me an update ` +
      `on when payment is expected?\n\nThanks,\n`;
  } else {
    body =
      `Hi,\n\nInvoice ${input.invoiceNumber} for ${amount} was due ${dueDate} and is now ` +
      `${daysLate} days overdue. Please could you confirm when this will be settled — ` +
      `happy to talk it through if there's an issue on your end.\n\nThanks,\n`;
  }

  if (runningLate) {
    body += `\n(This is later than usual for ${input.clientName} — worth a call rather than another email if it drags on.)\n`;
  }

  return {
    subject: `${daysLate > 21 ? "Overdue: " : ""}Invoice ${input.invoiceNumber}${daysLate > 0 ? ` — ${daysLate} days overdue` : ""}`,
    body,
    daysLate,
  };
}
