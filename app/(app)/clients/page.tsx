import { Card, EmptyState, Field, Money, inputClass } from "@/components/ui/primitives";
import { CreatePanel, selectClass } from "@/components/ui/CreatePanel";
import { PageBody, PageHeader } from "@/components/ui/page";
import { createClient } from "@/lib/db/actions";
import { listClients } from "@/lib/db/queries";
import { formatMoney, toPence } from "@/lib/money";

export const metadata = { title: "Clients · Freelance OS" };

const VAT_LABELS = {
  standard: "Standard",
  reverse_charge: "Reverse charge",
  exempt: "Exempt",
  outside_scope: "Outside scope",
} as const;

export default async function ClientsPage() {
  const clients = await listClients();

  return (
    <>
      <PageHeader title="Clients" subtitle={`${clients.length} on the books`} />

      <PageBody>
        <CreatePanel action={createClient} label="Add a client" title="New client">
          <Field label="Name">
            <input className={inputClass} name="name" required />
          </Field>
          <Field label="Day rate" hint="Optional. Used as the default on new projects.">
            <input className={inputClass} name="default_day_rate_pence" inputMode="decimal" placeholder="£750.00" />
          </Field>
          <Field label="Payment terms" hint="Days from issue.">
            <input className={inputClass} name="payment_terms_days" type="number" min={0} max={365} defaultValue={30} required />
          </Field>
          <Field label="VAT treatment">
            <select className={selectClass} name="vat_treatment" defaultValue="standard">
              {Object.entries(VAT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Field label="Company number">
            <input className={inputClass} name="company_number" />
          </Field>
          <Field label="VAT number">
            <input className={inputClass} name="vat_number" />
          </Field>
        </CreatePanel>

        <Card>
          {clients.length === 0 ? (
            <EmptyState
              title="No clients yet"
              description="Everything else hangs off a client — projects, invoices, and the email and meeting matching later. Add the first one above."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {clients.map((client) => (
                <li key={client.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{client.name}</p>
                    <p className="text-xs text-ink-faint">
                      {client.payment_terms_days} day terms · {VAT_LABELS[client.vat_treatment]}
                    </p>
                  </div>
                  {client.default_day_rate_pence !== null ? (
                    <Money size="sm" tone="muted">
                      {`${formatMoney(toPence(client.default_day_rate_pence))}/day`}
                    </Money>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </PageBody>
    </>
  );
}
