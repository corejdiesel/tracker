import { getSessionUserId } from "@/lib/auth/session";
import { withUser } from "./client";
import { sumPence, toPence } from "@/lib/money";
import type {
  Client, ContactWithClient, EmailThread, ExpenseWithProject, InvoiceWithClient,
  ProjectWithClient, RecurringCost, RunningTimer, Task, TaskWithProject,
  TimeEntryWithProject, WorkArtefact,
} from "./types";

/**
 * Every query filters `deleted_at is null` — nothing is hard-deleted, so a
 * missing filter silently resurrects records. Postgres RLS (FORCE ROW LEVEL
 * SECURITY, keyed on the session's app.user_id — see lib/db/client.ts)
 * scopes rows to the signed-in user; the filters here are about
 * correctness, not access. `db()` below is what actually establishes that
 * session context for every query in this file.
 */

async function db() {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("Not signed in.");
  return withUser(userId);
}

export async function listClients(): Promise<Client[]> {
  const conn = await db();
  return conn.query<Client>(
    `select id, name, company_number, vat_number, default_day_rate_pence,
            payment_terms_days, vat_treatment, notes
       from public.clients
      where deleted_at is null
      order by name`
  );
}

export async function listProjects(): Promise<ProjectWithClient[]> {
  const conn = await db();
  const rows = await conn.query<Record<string, unknown>>(
    `select p.id, p.client_id, p.name, p.status, p.fee_structure, p.fee_pence,
            p.day_rate_pence, p.estimated_days, p.probability, p.starts_on, p.ends_on,
            c.name as client_name
       from public.projects p
       left join public.clients c on c.id = p.client_id
      where p.deleted_at is null
      order by p.starts_on desc nulls last`
  );
  return rows.map((r) => ({
    ...r,
    clients: r.client_name !== null ? { name: r.client_name } : null,
  })) as unknown as ProjectWithClient[];
}

export async function listInvoices(): Promise<InvoiceWithClient[]> {
  const conn = await db();
  const rows = await conn.query<Record<string, unknown>>(
    `select i.id, i.client_id, i.project_id, i.number, i.issue_date, i.due_date,
            i.subtotal_pence, i.vat_pence, i.total_pence, i.status, i.paid_on,
            c.name as client_name
       from public.invoices i
       left join public.clients c on c.id = i.client_id
      where i.deleted_at is null
      order by i.due_date`
  );
  return rows.map((r) => ({
    ...r,
    clients: r.client_name !== null ? { name: r.client_name } : null,
  })) as unknown as InvoiceWithClient[];
}

export async function listRecurringCosts(): Promise<RecurringCost[]> {
  const conn = await db();
  return conn.query<RecurringCost>(
    `select id, vendor, amount_pence, cadence, next_charge_on, category_slug,
            cancel_by, dependency, last_reviewed_on, active
       from public.recurring_costs
      where deleted_at is null
      order by next_charge_on`
  );
}

export async function listOpenTasks(): Promise<Task[]> {
  const conn = await db();
  return conn.query<Task>(
    `select id, project_id, title, due_on, status, source
       from public.tasks
      where deleted_at is null and status in ('open','doing')
      order by due_on nulls last`
  );
}

/* Time and the session log ─────────────────────────────────────────────────*/

export async function listTimeEntries(since?: string): Promise<TimeEntryWithProject[]> {
  const conn = await db();
  const rows = await conn.query<Record<string, unknown>>(
    `select t.id, t.project_id, t.task_id, t.worked_on, t.minutes, t.note,
            t.billable, t.source, p.name as project_name, c.name as client_name
       from public.time_entries t
       left join public.projects p on p.id = t.project_id
       left join public.clients c on c.id = p.client_id
      where t.deleted_at is null
        and ($1::date is null or t.worked_on >= $1::date)
      order by t.worked_on desc, t.created_at desc`,
    [since ?? null]
  );
  return rows.map((r) => ({
    ...r,
    projects:
      r.project_name !== null
        ? { name: r.project_name, clients: r.client_name !== null ? { name: r.client_name } : null }
        : null,
  })) as unknown as TimeEntryWithProject[];
}

export async function getRunningTimer(): Promise<RunningTimer | null> {
  const conn = await db();
  // At most one row exists per user — owner_id is the primary key.
  const rows = await conn.query<RunningTimer>(
    `select owner_id, project_id, task_id, started_at, note from public.running_timers`
  );
  return rows[0] ?? null;
}

export async function listArtefacts(limit = 60): Promise<WorkArtefact[]> {
  const conn = await db();
  return conn.query<WorkArtefact>(
    `select id, project_id, time_entry_id, kind, storage_path, url, caption,
            captured_at, byte_size
       from public.work_artefacts
      where deleted_at is null
      order by captured_at desc
      limit $1`,
    [limit]
  );
}

/**
 * Short-lived signed URLs for stored artefacts.
 *
 * DEFERRED: this always returns an empty map. Supabase Storage's private
 * bucket + signed-URL model doesn't have a Neon equivalent — Neon has no
 * file storage at all — and picking a replacement (Cloudflare R2, S3,
 * Vercel Blob) is a real decision, not a default to guess at mid-migration.
 * Existing storage_path values from before this migration are orphaned:
 * the rows and captions still show, but the images themselves are
 * unreachable until this is wired to something. See the Notion action list.
 */
export async function signArtefacts(
  _artefacts: readonly WorkArtefact[],
  _expiresInSeconds = 300
): Promise<Map<string, string>> {
  return new Map();
}

export async function listExpenses(since?: string): Promise<ExpenseWithProject[]> {
  const conn = await db();
  const rows = await conn.query<Record<string, unknown>>(
    `select e.id, e.spent_on, e.vendor, e.net_pence, e.vat_pence, e.gross_pence,
            e.category_slug, e.entity, e.business_percent, e.is_capital_asset,
            e.disallowable, e.project_id, e.recurring_cost_id, e.attachment_path,
            e.source, p.name as project_name
       from public.expenses e
       left join public.projects p on p.id = e.project_id
      where e.deleted_at is null
        and ($1::date is null or e.spent_on >= $1::date)
      order by e.spent_on desc`,
    [since ?? null]
  );
  return rows.map((r) => ({
    ...r,
    projects: r.project_name !== null ? { name: r.project_name } : null,
  })) as unknown as ExpenseWithProject[];
}

export async function listContacts(): Promise<ContactWithClient[]> {
  const conn = await db();
  const rows = await conn.query<Record<string, unknown>>(
    `select ct.id, ct.client_id, ct.name, ct.email, ct.role, c.name as client_name
       from public.contacts ct
       left join public.clients c on c.id = ct.client_id
      where ct.deleted_at is null
      order by ct.name`
  );
  return rows.map((r) => ({
    ...r,
    clients: r.client_name !== null ? { name: r.client_name } : null,
  })) as unknown as ContactWithClient[];
}

/** Every open task, ordered by due date. Distinct from listOpenTasks (Today's
 * dashboard reader) only in shape — this one joins the project for display. */
export async function listAllTasks(): Promise<TaskWithProject[]> {
  const conn = await db();
  const rows = await conn.query<Record<string, unknown>>(
    `select t.id, t.project_id, t.title, t.due_on, t.status, t.source,
            p.name as project_name
       from public.tasks t
       left join public.projects p on p.id = t.project_id
      where t.deleted_at is null and t.status <> 'dropped'
      order by t.due_on nulls last`
  );
  return rows.map((r) => ({
    ...r,
    projects: r.project_name !== null ? { name: r.project_name } : null,
  })) as unknown as TaskWithProject[];
}

/**
 * A rough starting point for the Tax calculator — trailing-12-month company
 * income (invoiced net) minus company expenses (net). This is NOT an
 * accounting profit figure: it ignores cost of sales timing, prior-period
 * adjustments and anything not yet entered. The Tax page must present it as
 * an editable default, never as a computed fact.
 */
export async function estimateTrailingCompanyProfit(
  since: string
): Promise<{ incomePence: bigint; expensesPence: bigint }> {
  const conn = await db();
  const [invoiceRows, expenseRows] = await Promise.all([
    conn.query<{ subtotal_pence: number }>(
      `select subtotal_pence from public.invoices
        where deleted_at is null and status <> 'draft' and issue_date >= $1::date`,
      [since]
    ),
    conn.query<{ net_pence: number }>(
      `select net_pence from public.expenses
        where deleted_at is null and entity = 'company' and spent_on >= $1::date`,
      [since]
    ),
  ]);

  return {
    incomePence: sumPence(invoiceRows.map((r) => toPence(r.subtotal_pence))),
    expensesPence: sumPence(expenseRows.map((r) => toPence(r.net_pence))),
  };
}

/* Export-only reads — no UI page uses these tables directly yet, so they
 * don't need a display-shaped join; the export just needs every column. */

export async function listEngagementWindows(): Promise<import("./types").EngagementWindow[]> {
  const conn = await db();
  return conn.query(
    `select id, project_id, starts_on, ends_on, days_committed, note
       from public.engagement_windows
      where deleted_at is null
      order by starts_on`
  );
}

/** Engagement windows overlapping [from, to] — what the Timetable page
 * actually needs, distinct from listEngagementWindows' full-history read
 * for the export. */
export async function listUpcomingEngagementWindows(
  from: string,
  to: string
): Promise<import("./types").EngagementWindow[]> {
  const conn = await db();
  return conn.query(
    `select id, project_id, starts_on, ends_on, days_committed, note
       from public.engagement_windows
      where deleted_at is null and starts_on <= $2 and ends_on >= $1
      order by starts_on`,
    [from, to]
  );
}

export async function listInvoiceLineItems() {
  const conn = await db();
  return conn.query(
    `select id, invoice_id, description, quantity, unit_price_pence, vat_rate, position
       from public.invoice_line_items
      where deleted_at is null
      order by invoice_id, position`
  );
}

export async function listTaxObligations() {
  const conn = await db();
  return conn.query(
    `select id, kind, period_start, period_end, deadline, estimated_pence, status, notes
       from public.tax_obligations
      where deleted_at is null
      order by deadline`
  );
}

export async function listAllArtefactMetadata() {
  const conn = await db();
  return conn.query(
    `select id, project_id, time_entry_id, kind, url, caption, captured_at
       from public.work_artefacts
      where deleted_at is null
      order by captured_at`
  );
}

/* Mail triage ────────────────────────────────────────────────────────────*/

export async function listUnmatchedThreads(): Promise<EmailThread[]> {
  const conn = await db();
  return conn.query<EmailThread>(
    `select id, external_id, client_id, project_id, subject, from_name,
            from_address, snippet, kind, matched_by, received_at
       from public.email_threads
      where deleted_at is null and matched_by = 'unmatched'
      order by received_at desc`
  );
}
