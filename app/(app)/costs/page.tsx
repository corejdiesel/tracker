import { Badge, Card, EmptyState, Field, Money, inputClass } from "@/components/ui/primitives";
import { CreatePanel, selectClass } from "@/components/ui/CreatePanel";
import { PageBody, PageHeader } from "@/components/ui/page";
import { createRecurringCost } from "@/lib/db/actions";
import { listRecurringCosts } from "@/lib/db/queries";
import { annualPence, monthlyBurn, monthlyPence } from "@/lib/db/costs";
import { formatMoney, toPence } from "@/lib/money";
import { addDays, formatDate, relativeDays, todayIso } from "@/lib/dates";

export const metadata = { title: "Money out · Freelance OS" };

export default async function CostsPage() {
  const today = todayIso();
  const costs = await listRecurringCosts();
  const active = costs.filter((c) => c.active);

  const burn = monthlyBurn(costs);
  const annual = active.reduce<bigint>(
    (total, c) => total + annualPence(toPence(c.amount_pence), c.cadence),
    BigInt(0)
  );

  // The cancel-by watchlist: anything that renews automatically inside a month.
  const horizon = addDays(today, 30);
  const watchlist = active.filter((c) => c.cancel_by !== null && c.cancel_by <= horizon);

  return (
    <>
      <PageHeader
        title="Money out"
        subtitle={`${active.length} active ${active.length === 1 ? "cost" : "costs"} leaving the account regardless of what you do`}
      />

      <PageBody>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card className="flex flex-col gap-1.5 px-4 py-4">
            <p className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">Monthly burn</p>
            <Money size="lg" basis="gross">{formatMoney(burn)}</Money>
          </Card>
          <Card className="flex flex-col gap-1.5 px-4 py-4">
            <p className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-muted">Annual burn</p>
            <Money size="lg" basis="gross">{formatMoney(annual)}</Money>
          </Card>
        </div>

        {watchlist.length > 0 ? (
          <Card className="border-warning">
            <div className="flex flex-col gap-1 px-4 py-3">
              <p className="text-2xs font-medium uppercase tracking-[0.08em] text-warning">
                Cancel by
              </p>
              <ul className="text-sm text-ink">
                {watchlist.map((c) => (
                  <li key={c.id}>
                    {c.vendor} renews unless cancelled{" "}
                    {c.cancel_by ? relativeDays(c.cancel_by, today) : ""}
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        ) : null}

        <CreatePanel action={createRecurringCost} label="Add a recurring cost" title="New recurring cost">
          <Field label="Vendor">
            <input className={inputClass} name="vendor" required placeholder="Adobe" />
          </Field>
          <Field label="Amount">
            <input className={inputClass} name="amount_pence" inputMode="decimal" required placeholder="£59.99" />
          </Field>
          <Field label="Cadence">
            <select className={selectClass} name="cadence" defaultValue="monthly">
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </Field>
          <Field label="Next charge">
            <input className={inputClass} name="next_charge_on" type="date" required />
          </Field>
          <Field label="Category" hint="Maps to the tax engine's expense taxonomy later.">
            <input className={inputClass} name="category_slug" required defaultValue="office-and-equipment" />
          </Field>
          <Field label="Cancel by" hint="Optional. The last day to cancel before it renews.">
            <input className={inputClass} name="cancel_by" type="date" />
          </Field>
          <Field label="Dependency" hint="Hard means the business stops without it.">
            <select className={selectClass} name="dependency" defaultValue="discretionary">
              <option value="discretionary">Discretionary</option>
              <option value="hard">Hard</option>
            </select>
          </Field>
        </CreatePanel>

        <Card>
          {costs.length === 0 ? (
            <EmptyState
              title="Nothing recurring yet"
              description="Subscriptions, retainers, insurance — anything that leaves the account on a cadence. This total feeds the safe-to-spend figure."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {costs.map((cost) => (
                <li key={cost.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">
                      {cost.vendor}
                      {cost.dependency === "hard" ? (
                        <span className="ml-2 align-middle"><Badge tone="accent">Hard</Badge></span>
                      ) : null}
                      {!cost.active ? (
                        <span className="ml-2 align-middle"><Badge>Cancelled</Badge></span>
                      ) : null}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {cost.cadence} · next {formatDate(cost.next_charge_on)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <Money size="sm">{formatMoney(toPence(cost.amount_pence))}</Money>
                    <p className="text-xs text-ink-faint tabular">
                      {formatMoney(monthlyPence(toPence(cost.amount_pence), cost.cadence))}/mo
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
