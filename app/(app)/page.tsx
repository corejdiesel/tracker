import Link from "next/link";
import { Badge, Card, CardHeader, EmptyState, Money } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/ui/page";
import { addDays, formatDate, formatDateShort, relativeDays, todayIso } from "@/lib/dates";
import { formatMoney, formatMoneyWhole } from "@/lib/money";
import { monthlyBurn } from "@/lib/db/costs";
import { effectiveStatus, expectedBetween, totalOverdue, totalOwed } from "@/lib/db/invoices";
import { listInvoices, listOpenTasks, listRecurringCosts } from "@/lib/db/queries";

export const metadata = { title: "Today · Freelance OS" };

export default async function TodayPage() {
  const today = todayIso();
  const [invoices, costs, tasks] = await Promise.all([
    listInvoices(),
    listRecurringCosts(),
    listOpenTasks(),
  ]);

  const owed = totalOwed(invoices);
  const overdue = totalOverdue(invoices, today);
  const burn = monthlyBurn(costs);
  const next30 = expectedBetween(invoices, today, addDays(today, 30));

  const overdueInvoices = invoices
    .filter((i) => effectiveStatus(i, today) === "overdue")
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const dueSoon = tasks
    .filter((t) => t.due_on !== null && t.due_on <= addDays(today, 7))
    .sort((a, b) => (a.due_on ?? "").localeCompare(b.due_on ?? ""));

  return (
    <>
      <PageHeader title="Today" subtitle={formatDate(today)} />

      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Owed to you" value={formatMoneyWhole(owed)} basis="gross" />
          <Figure
            label="Of that, overdue"
            value={formatMoneyWhole(overdue)}
            basis="gross"
            tone={overdue > BigInt(0) ? "danger" : "default"}
          />
          <Figure label="Monthly burn" value={formatMoneyWhole(burn)} basis="gross" />
          <Figure
            label="Expected in 30 days"
            value={formatMoneyWhole(next30.due)}
            basis="gross"
            note={
              next30.scheduled > BigInt(0)
                ? `+ ${formatMoneyWhole(next30.scheduled)} scheduled, not yet sent`
                : undefined
            }
          />
        </div>

        {/* §8: never invent a tax number. Safe-to-spend needs a liability
            estimate, and no tax module exists yet — so say exactly that
            rather than showing a figure that looks authoritative. */}
        <Card>
          <CardHeader title="Safe to spend" />
          <div className="flex flex-col gap-2 px-4 py-5">
            <p className="font-display text-3xl leading-none text-ink-faint">Not yet computable</p>
            <p className="max-w-prose text-sm text-ink-muted">
              This figure is cash in the account, minus tax set aside, minus committed costs.
              Two of the three inputs exist: {formatMoney(burn)} of monthly committed costs, and{" "}
              {formatMoney(owed)} owed to you. The tax liability is missing — no tax module is
              wired up yet, and the app will not estimate what it cannot compute.
            </p>
          </div>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="Overdue"
              action={
                <Link href="/invoices" className="text-xs text-accent hover:underline">
                  All invoices
                </Link>
              }
            />
            {overdueInvoices.length === 0 ? (
              <EmptyState
                title="Nothing overdue"
                description="Every invoice you've sent is still within its payment terms."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {overdueInvoices.map((invoice) => (
                  <li key={invoice.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">
                        {invoice.clients?.name ?? "Unknown client"}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {invoice.number} · due {relativeDays(invoice.due_date, today)}
                      </p>
                    </div>
                    <Money tone="danger" size="sm">
                      {formatMoney(BigInt(invoice.total_pence))}
                    </Money>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Due this week" />
            {dueSoon.length === 0 ? (
              <EmptyState
                title="Nothing due this week"
                description="Tasks with a due date in the next seven days show up here. Add them from a project."
              />
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {dueSoon.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <p className="min-w-0 truncate text-sm text-ink">{task.title}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      {task.source !== "manual" ? <Badge tone="accent">{task.source}</Badge> : null}
                      <span className="text-xs text-ink-faint">
                        {task.due_on ? formatDateShort(task.due_on) : "—"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function Figure({
  label,
  value,
  basis,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  basis?: "net" | "gross" | "estimated";
  note?: string;
  tone?: "default" | "danger";
}) {
  return (
    <Card className="flex flex-col gap-1.5 px-4 py-4">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">{label}</p>
      <Money size="hero" tone={tone} basis={basis}>
        {value}
      </Money>
      {note ? <p className="text-xs text-ink-faint">{note}</p> : null}
    </Card>
  );
}
