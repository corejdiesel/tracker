import { Badge, Card, EmptyState, Field, Money, inputClass, type BadgeTone } from "@/components/ui/primitives";
import { CreatePanel, selectClass } from "@/components/ui/CreatePanel";
import { PageBody, PageHeader } from "@/components/ui/page";
import { ChaserDraft } from "@/components/mail/ChaserDraft";
import { createInvoice } from "@/lib/db/actions";
import { listClients, listInvoices } from "@/lib/db/queries";
import { effectiveStatus, medianPaymentLag, totalOverdue, totalOwed } from "@/lib/db/invoices";
import { draftInvoiceChaser } from "@/lib/mail/chaser";
import { formatMoney, toPence } from "@/lib/money";
import { formatDate, relativeDays, todayIso } from "@/lib/dates";
import type { InvoiceStatus } from "@/lib/db/types";

export const metadata = { title: "Money in · Freelance OS" };

const STATUS: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  scheduled: { label: "Scheduled", tone: "accent" },
  sent: { label: "Sent", tone: "warning" },
  paid: { label: "Paid", tone: "positive" },
  overdue: { label: "Overdue", tone: "danger" },
  written_off: { label: "Written off", tone: "neutral" },
};

export default async function InvoicesPage() {
  const today = todayIso();
  const [invoices, clients] = await Promise.all([listInvoices(), listClients()]);

  const owed = totalOwed(invoices);
  const overdue = totalOverdue(invoices, today);
  const lag = medianPaymentLag(invoices);

  return (
    <>
      <PageHeader
        title="Money in"
        subtitle={
          lag === null
            ? "No payment history yet — the forecast will use real payment lag once invoices are paid."
            : `Clients pay a median ${lag} days after issue.`
        }
      />

      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-1.5 px-4 py-4">
            <p className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">Owed to you</p>
            <Money size="lg" basis="gross">{formatMoney(owed)}</Money>
          </Card>
          <Card className="flex flex-col gap-1.5 px-4 py-4">
            <p className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">Overdue</p>
            <Money size="lg" basis="gross" tone={overdue > BigInt(0) ? "danger" : "default"}>
              {formatMoney(overdue)}
            </Money>
          </Card>
        </div>

        <CreatePanel action={createInvoice} label="Add an invoice" title="New invoice">
          <Field label="Client">
            <select className={selectClass} name="client_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Number">
            <input className={inputClass} name="number" required placeholder="INV-0042" />
          </Field>
          <Field label="Status" hint="Scheduled invoices count towards the forecast, not what's owed.">
            <select className={selectClass} name="status" defaultValue="draft">
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="sent">Sent</option>
            </select>
          </Field>
          <Field label="Issue date">
            <input className={inputClass} name="issue_date" type="date" required />
          </Field>
          <Field label="Due date">
            <input className={inputClass} name="due_date" type="date" required />
          </Field>
          <Field label="Net amount" hint="Excluding VAT.">
            <input className={inputClass} name="subtotal_pence" inputMode="decimal" required placeholder="£4,200.00" />
          </Field>
          <Field label="VAT" hint="Leave blank if none.">
            <input className={inputClass} name="vat_pence" inputMode="decimal" placeholder="£840.00" />
          </Field>
        </CreatePanel>

        <Card>
          {invoices.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Add invoices by hand to start — bank reconciliation comes later. Scheduled future invoices are included so the cash forecast works from day one."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {invoices.map((invoice) => {
                const status = effectiveStatus(invoice, today);

                // This client's own payment history, not the whole book's —
                // the chaser should judge lateness against how THIS client
                // usually behaves, not an average across every client.
                const clientLag = medianPaymentLag(
                  invoices.filter((i) => i.client_id === invoice.client_id)
                );

                return (
                  <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">
                        {invoice.clients?.name ?? "Unknown client"}
                        <span className="text-ink-faint"> · {invoice.number}</span>
                      </p>
                      <p className="text-xs text-ink-faint">
                        Issued {formatDate(invoice.issue_date)} · due{" "}
                        {relativeDays(invoice.due_date, today)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                      <Money size="sm" tone={status === "overdue" ? "danger" : "default"}>
                        {formatMoney(toPence(invoice.total_pence))}
                      </Money>
                    </div>
                    {status === "overdue" ? (
                      <div className="w-full">
                        <ChaserDraft
                          {...draftInvoiceChaser({
                            clientName: invoice.clients?.name ?? "this client",
                            invoiceNumber: invoice.number,
                            dueDate: invoice.due_date,
                            totalPence: toPence(invoice.total_pence),
                            today,
                            medianPaymentLagDays: clientLag,
                          })}
                        />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
