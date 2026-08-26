import { createServerSupabase } from "@/lib/supabase/server";
import type {
  Client, InvoiceWithClient, ProjectWithClient, RecurringCost, Task,
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
