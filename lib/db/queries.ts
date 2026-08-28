import { createServerSupabase } from "@/lib/supabase/server";
import { ARTEFACT_BUCKET } from "./constants";
import { sumPence, toPence } from "@/lib/money";
import type {
  Client, ContactWithClient, EmailThread, ExpenseWithProject, InvoiceWithClient,
  ProjectWithClient, RecurringCost, RunningTimer, Task, TaskWithProject,
  TimeEntryWithProject, WorkArtefact,
} from "./types";


/**
 * Every query filters `deleted_at is null` — nothing is hard-deleted, so a
 * missing filter silently resurrects records. RLS scopes rows to the signed-in
 * user in Postgres; the filters here are about correctness, not access.
 */

export async function listClients(): Promise<Client[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("clients")
    .select("id,name,company_number,vat_number,default_day_rate_pence,payment_terms_days,vat_treatment,notes")
    .is("deleted_at", null)
    .order("name");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listProjects(): Promise<ProjectWithClient[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id,client_id,name,status,fee_structure,fee_pence,day_rate_pence,estimated_days,probability,starts_on,ends_on,clients(name)"
    )
    .is("deleted_at", null)
    .order("starts_on", { ascending: false, nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ProjectWithClient[];
}

export async function listInvoices(): Promise<InvoiceWithClient[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("invoices")
    .select(
      "id,client_id,project_id,number,issue_date,due_date,subtotal_pence,vat_pence,total_pence,status,paid_on,clients(name)"
    )
    .is("deleted_at", null)
    .order("due_date");

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InvoiceWithClient[];
}

export async function listRecurringCosts(): Promise<RecurringCost[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("recurring_costs")
    .select(
      "id,vendor,amount_pence,cadence,next_charge_on,category_slug,cancel_by,dependency,last_reviewed_on,active"
    )
    .is("deleted_at", null)
    .order("next_charge_on");

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listOpenTasks(): Promise<Task[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select("id,project_id,title,due_on,status,source")
    .is("deleted_at", null)
    .in("status", ["open", "doing"])
    .order("due_on", { nullsFirst: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/* Time and the session log ─────────────────────────────────────────────────*/

export async function listTimeEntries(since?: string): Promise<TimeEntryWithProject[]> {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("time_entries")
    .select("id,project_id,task_id,worked_on,minutes,note,billable,source,projects(name,clients(name))")
    .is("deleted_at", null);

  if (since) query = query.gte("worked_on", since);

  const { data, error } = await query
    .order("worked_on", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TimeEntryWithProject[];
}

export async function getRunningTimer(): Promise<RunningTimer | null> {
  const supabase = await createServerSupabase();
  // At most one row exists per user — owner_id is the primary key.
  const { data, error } = await supabase
    .from("running_timers")
    .select("owner_id,project_id,task_id,started_at,note")
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function listArtefacts(limit = 60): Promise<WorkArtefact[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("work_artefacts")
    .select("id,project_id,time_entry_id,kind,storage_path,url,caption,captured_at,byte_size")
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Short-lived signed URLs for stored artefacts. The bucket is private, so
 * nothing renders without one — and the URLs expire rather than becoming a
 * durable public link to client work.
 */
export async function signArtefacts(
  artefacts: readonly WorkArtefact[],
  expiresInSeconds = 300
): Promise<Map<string, string>> {
  const paths = artefacts
    .map((a) => a.storage_path)
    .filter((path): path is string => path !== null);

  if (paths.length === 0) return new Map();

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.storage
    .from(ARTEFACT_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);

  // A missing thumbnail should not take down the page — the UI falls back to
  // a caption-only tile.
  if (error || !data) return new Map();

  const signed = new Map<string, string>();
  for (const item of data) {
    if (item.signedUrl && item.path) signed.set(item.path, item.signedUrl);
  }
  return signed;
}

export async function listExpenses(since?: string): Promise<ExpenseWithProject[]> {
  const supabase = await createServerSupabase();
  let query = supabase
    .from("expenses")
    .select(
      "id,spent_on,vendor,net_pence,vat_pence,gross_pence,category_slug,entity,business_percent,is_capital_asset,disallowable,project_id,recurring_cost_id,attachment_path,source,projects(name)"
    )
    .is("deleted_at", null);

  if (since) query = query.gte("spent_on", since);

  const { data, error } = await query.order("spent_on", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ExpenseWithProject[];
}

export async function listContacts(): Promise<ContactWithClient[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("contacts")
    .select("id,client_id,name,email,role,clients(name)")
    .is("deleted_at", null)
    .order("name");

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ContactWithClient[];
}

/** Every open task, ordered by due date. Distinct from listOpenTasks (Today's
 * dashboard reader) only in shape — this one joins the project for display. */
export async function listAllTasks(): Promise<TaskWithProject[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tasks")
    .select("id,project_id,title,due_on,status,source,projects(name)")
    .is("deleted_at", null)
    .neq("status", "dropped")
    .order("due_on", { nullsFirst: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TaskWithProject[];
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
  const supabase = await createServerSupabase();

  const [invoicesResult, expensesResult] = await Promise.all([
    supabase
      .from("invoices")
      .select("subtotal_pence")
      .is("deleted_at", null)
      .neq("status", "draft")
      .gte("issue_date", since),
    supabase
      .from("expenses")
      .select("net_pence")
      .is("deleted_at", null)
      .eq("entity", "company")
      .gte("spent_on", since),
  ]);

  if (invoicesResult.error) throw new Error(invoicesResult.error.message);
  if (expensesResult.error) throw new Error(expensesResult.error.message);

  const incomePence = sumPence((invoicesResult.data ?? []).map((r) => toPence(r.subtotal_pence)));
  const expensesPence = sumPence((expensesResult.data ?? []).map((r) => toPence(r.net_pence)));

  return { incomePence, expensesPence };
}

/* Export-only reads — no UI page uses these tables directly yet, so they
 * don't need a display-shaped join; the export just needs every column. */

export async function listEngagementWindows() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("engagement_windows")
    .select("id,project_id,starts_on,ends_on,days_committed,note")
    .is("deleted_at", null)
    .order("starts_on");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listInvoiceLineItems() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("invoice_line_items")
    .select("id,invoice_id,description,quantity,unit_price_pence,vat_rate,position")
    .is("deleted_at", null)
    .order("invoice_id")
    .order("position");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listTaxObligations() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("tax_obligations")
    .select("id,kind,period_start,period_end,deadline,estimated_pence,status,notes")
    .is("deleted_at", null)
    .order("deadline");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listAllArtefactMetadata() {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("work_artefacts")
    .select("id,project_id,time_entry_id,kind,url,caption,captured_at")
    .is("deleted_at", null)
    .order("captured_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/* Mail triage ────────────────────────────────────────────────────────────*/

export async function listUnmatchedThreads(): Promise<EmailThread[]> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from("email_threads")
    .select("id,external_id,client_id,project_id,subject,from_name,from_address,snippet,kind,matched_by,received_at")
    .is("deleted_at", null)
    .eq("matched_by", "unmatched")
    .order("received_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}
