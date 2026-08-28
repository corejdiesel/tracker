import { Badge, Card, EmptyState, Field, Money, inputClass } from "@/components/ui/primitives";
import { CreatePanel, selectClass } from "@/components/ui/CreatePanel";
import { PageBody, PageHeader } from "@/components/ui/page";
import { createExpense } from "@/lib/db/actions";
import { listExpenses, listProjects } from "@/lib/db/queries";
import { EXPENSE_CATEGORIES } from "@/lib/db/expense-categories";
import { formatMoney, sumPence, toPence } from "@/lib/money";
import { addDays, formatDate, todayIso } from "@/lib/dates";

export const metadata = { title: "Expenses · Freelance OS" };

export default async function ExpensesPage() {
  const today = todayIso();
  const since = addDays(today, -90);
  const [expenses, projects] = await Promise.all([listExpenses(since), listProjects()]);

  const total = sumPence(expenses.map((e) => toPence(e.gross_pence)));
  const categoryLabel = (slug: string) =>
    EXPENSE_CATEGORIES.find((c) => c.slug === slug)?.label ?? slug;

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle={`${formatMoney(total)} logged in the last 90 days`}
      />

      <PageBody>
        <CreatePanel action={createExpense} label="Add an expense" title="New expense">
          <Field label="Vendor">
            <input className={inputClass} name="vendor" required placeholder="Adobe" />
          </Field>
          <Field label="Date">
            <input className={inputClass} name="spent_on" type="date" defaultValue={today} required />
          </Field>
          <Field label="Category">
            <select className={selectClass} name="category_slug" defaultValue={EXPENSE_CATEGORIES[0]!.slug}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.slug} value={c.slug}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Net amount" hint="Excluding VAT.">
            <input className={inputClass} name="net_pence" inputMode="decimal" required placeholder="£59.99" />
          </Field>
          <Field label="VAT" hint="Leave blank if none.">
            <input className={inputClass} name="vat_pence" inputMode="decimal" placeholder="£12.00" />
          </Field>
          <Field label="Entity" hint="A company cost and a personal one land in different tax regimes.">
            <select className={selectClass} name="entity" defaultValue="company">
              <option value="company">Company</option>
              <option value="personal">Personal</option>
            </select>
          </Field>
          <Field label="Business use %">
            <input className={inputClass} name="business_percent" type="number" min={1} max={100} defaultValue={100} required />
          </Field>
          <Field label="Project" hint="Optional — links the cost to a job.">
            <select className={selectClass} name="project_id" defaultValue="">
              <option value="">None</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Capital asset" hint="Equipment over £1,000 — relieved differently, not as a revenue expense.">
            <label className="flex h-9 items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="is_capital_asset" />
              Yes
            </label>
          </Field>
          <Field label="Disallowable" hint="e.g. client entertainment — kept on the books, never reduces tax.">
            <label className="flex h-9 items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="disallowable" />
              Yes
            </label>
          </Field>
        </CreatePanel>

        <Card>
          {expenses.length === 0 ? (
            <EmptyState
              title="No expenses logged yet"
              description="Manual entry for now — receipt capture from mail comes in a later phase. Everything here feeds the tax module once it's wired up."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {expenses.map((expense) => (
                <li key={expense.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      {expense.vendor}
                      {expense.is_capital_asset ? (
                        <span className="ml-2 align-middle"><Badge tone="accent">Capital</Badge></span>
                      ) : null}
                      {expense.disallowable ? (
                        <span className="ml-2 align-middle"><Badge tone="warning">Disallowable</Badge></span>
                      ) : null}
                      {expense.entity === "personal" ? (
                        <span className="ml-2 align-middle"><Badge>Personal</Badge></span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {formatDate(expense.spent_on)} · {categoryLabel(expense.category_slug)}
                      {expense.business_percent < 100 ? ` · ${expense.business_percent}% business` : ""}
                      {expense.projects?.name ? ` · ${expense.projects.name}` : ""}
                    </p>
                  </div>
                  <Money size="sm">{formatMoney(toPence(expense.gross_pence))}</Money>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
