import { Badge, Card, EmptyState, Field, Money, inputClass, type BadgeTone } from "@/components/ui/primitives";
import { CreatePanel, selectClass } from "@/components/ui/CreatePanel";
import { PageBody, PageHeader } from "@/components/ui/page";
import { createProject } from "@/lib/db/actions";
import { listClients, listProjects } from "@/lib/db/queries";
import { formatMoney, toPence } from "@/lib/money";
import { formatDateShort } from "@/lib/dates";
import type { ProjectStatus } from "@/lib/db/types";

export const metadata = { title: "Projects · Freelance OS" };

const STATUS: Record<ProjectStatus, { label: string; tone: BadgeTone }> = {
  pitching: { label: "Pitching", tone: "accent" },
  won: { label: "Won", tone: "positive" },
  active: { label: "Active", tone: "positive" },
  delivered: { label: "Delivered", tone: "neutral" },
  invoiced: { label: "Invoiced", tone: "warning" },
  paid: { label: "Paid", tone: "positive" },
  dead: { label: "Dead", tone: "neutral" },
};

/** Order used by the pipeline view — earliest stage first. */
const ORDER: readonly ProjectStatus[] = [
  "pitching", "won", "active", "delivered", "invoiced", "paid", "dead",
];

export default async function ProjectsPage() {
  const [projects, clients] = await Promise.all([listProjects(), listClients()]);

  // Weighted pipeline: fee × probability, over everything not yet won.
  const weighted = projects
    .filter((p) => p.status === "pitching")
    .reduce<bigint>(
      (total, p) =>
        total + (toPence(p.fee_pence) * BigInt(p.probability ?? 0)) / BigInt(100),
      BigInt(0)
    );

  const grouped = ORDER.map((status) => ({
    status,
    items: projects.filter((p) => p.status === status),
  })).filter((group) => group.items.length > 0);

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle={
          weighted > BigInt(0)
            ? `${formatMoney(weighted)} of weighted pipeline still pitching`
            : "Nothing in the pipeline yet"
        }
      />

      <PageBody>
        <CreatePanel action={createProject} label="Add a project" title="New project">
          <Field label="Client">
            <select className={selectClass} name="client_id" required defaultValue="">
              <option value="" disabled>Choose…</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Name">
            <input className={inputClass} name="name" required />
          </Field>
          <Field label="Status">
            <select className={selectClass} name="status" defaultValue="pitching">
              {ORDER.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
            </select>
          </Field>
          <Field label="Fee structure">
            <select className={selectClass} name="fee_structure" defaultValue="fixed">
              <option value="fixed">Fixed</option>
              <option value="day_rate">Day rate</option>
              <option value="retainer">Retainer</option>
            </select>
          </Field>
          <Field label="Fee" hint="Total, excluding VAT.">
            <input className={inputClass} name="fee_pence" inputMode="decimal" placeholder="£12,000.00" />
          </Field>
          <Field label="Estimated days">
            <input className={inputClass} name="estimated_days" type="number" step="0.5" min="0" />
          </Field>
          <Field label="Probability" hint="0–100. Weights the pipeline forecast.">
            <input className={inputClass} name="probability" type="number" min="0" max="100" />
          </Field>
          <Field label="Starts">
            <input className={inputClass} name="starts_on" type="date" />
          </Field>
          <Field label="Ends">
            <input className={inputClass} name="ends_on" type="date" />
          </Field>
        </CreatePanel>

        {projects.length === 0 ? (
          <Card>
            <EmptyState
              title="No projects yet"
              description="A project belongs to a client and carries the fee. Booked time goes on engagement windows, which is what the timetable reads."
            />
          </Card>
        ) : (
          grouped.map(({ status, items }) => (
            <Card key={status}>
              <header className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
                <Badge tone={STATUS[status].tone}>{STATUS[status].label}</Badge>
                <span className="text-xs text-ink-faint">{items.length}</span>
              </header>
              <ul className="divide-y divide-[var(--border)]">
                {items.map((project) => (
                  <li key={project.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{project.name}</p>
                      <p className="text-xs text-ink-faint">
                        {project.clients?.name ?? "Unknown client"}
                        {project.starts_on ? ` · from ${formatDateShort(project.starts_on)}` : ""}
                        {project.probability !== null ? ` · ${project.probability}%` : ""}
                      </p>
                    </div>
                    {project.fee_pence !== null ? (
                      <Money size="sm" basis="net">{formatMoney(toPence(project.fee_pence))}</Money>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
      </PageBody>
    </>
  );
}
