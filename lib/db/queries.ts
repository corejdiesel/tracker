import { createServerSupabase } from "@/lib/supabase/server";
import { ARTEFACT_BUCKET } from "./constants";
import type {
  Client, InvoiceWithClient, ProjectWithClient, RecurringCost, RunningTimer,
  Task, TimeEntryWithProject, WorkArtefact,
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
