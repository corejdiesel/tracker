/**
 * Row types for the Phase 1 schema.
 *
 * Hand-written for now. Once a Supabase project exists these should be
 * replaced by `supabase gen types typescript` output so the types track the
 * migrations automatically — until then, this file and
 * `supabase/migrations/0001_initial_schema.sql` must be kept in step by hand.
 *
 * Money columns are `bigint` in Postgres. PostgREST serialises them as JSON
 * numbers, so they arrive as `number` and every read goes through `toPence()`
 * before any arithmetic.
 */

export type Uuid = string;
/** 'YYYY-MM-DD'. */
export type IsoDate = string;
/** A bigint pence column as PostgREST delivers it. */
export type PenceColumn = number;

export type VatTreatment = "standard" | "reverse_charge" | "exempt" | "outside_scope";
export type ProjectStatus =
  | "pitching" | "won" | "active" | "delivered" | "invoiced" | "paid" | "dead";
export type FeeStructure = "fixed" | "day_rate" | "retainer";
export type InvoiceStatus =
  | "draft" | "scheduled" | "sent" | "paid" | "overdue" | "written_off";
export type Cadence = "monthly" | "quarterly" | "annual";
export type CostDependency = "hard" | "discretionary";
export type ExpenseEntity = "company" | "personal";
export type RecordSource = "manual" | "granola" | "email" | "bank";

export interface Client {
  id: Uuid;
  name: string;
  company_number: string | null;
  vat_number: string | null;
  default_day_rate_pence: PenceColumn | null;
  payment_terms_days: number;
  vat_treatment: VatTreatment;
  notes: string | null;
}

export interface Project {
  id: Uuid;
  client_id: Uuid;
  name: string;
  status: ProjectStatus;
  fee_structure: FeeStructure;
  fee_pence: PenceColumn | null;
  day_rate_pence: PenceColumn | null;
  estimated_days: number | null;
  probability: number | null;
  starts_on: IsoDate | null;
  ends_on: IsoDate | null;
}

export interface EngagementWindow {
  id: Uuid;
  project_id: Uuid;
  starts_on: IsoDate;
  ends_on: IsoDate;
  days_committed: number;
  note: string | null;
}

export interface Invoice {
  id: Uuid;
  client_id: Uuid;
  project_id: Uuid | null;
  number: string;
  issue_date: IsoDate;
  due_date: IsoDate;
  subtotal_pence: PenceColumn;
  vat_pence: PenceColumn;
  total_pence: PenceColumn;
  status: InvoiceStatus;
  paid_on: IsoDate | null;
}

export interface RecurringCost {
  id: Uuid;
  vendor: string;
  amount_pence: PenceColumn;
  cadence: Cadence;
  next_charge_on: IsoDate;
  category_slug: string;
  cancel_by: IsoDate | null;
  dependency: CostDependency;
  last_reviewed_on: IsoDate | null;
  active: boolean;
}

export type TaskStatus = "open" | "doing" | "done" | "dropped";

export interface Task {
  id: Uuid;
  project_id: Uuid | null;
  title: string;
  due_on: IsoDate | null;
  status: TaskStatus;
  source: RecordSource;
}

export interface TaskWithProject extends Task {
  projects: Pick<Project, "name"> | null;
}

/** A project row with its client's name joined in, for list views. */
export interface ProjectWithClient extends Project {
  clients: Pick<Client, "name"> | null;
}

export interface InvoiceWithClient extends Invoice {
  clients: Pick<Client, "name"> | null;
}

export type ArtefactKind = "screenshot" | "file" | "link";

export interface TimeEntry {
  id: Uuid;
  project_id: Uuid;
  task_id: Uuid | null;
  worked_on: IsoDate;
  minutes: number;
  note: string | null;
  billable: boolean;
  source: RecordSource | "timer";
}

export interface TimeEntryWithProject extends TimeEntry {
  projects: (Pick<Project, "name"> & { clients: Pick<Client, "name"> | null }) | null;
}

export interface RunningTimer {
  owner_id: Uuid;
  project_id: Uuid;
  task_id: Uuid | null;
  /** ISO 8601 timestamp with zone — a timer is an instant, unlike a logged day. */
  started_at: string;
  note: string | null;
}

export interface WorkArtefact {
  id: Uuid;
  project_id: Uuid;
  time_entry_id: Uuid | null;
  kind: ArtefactKind;
  storage_path: string | null;
  url: string | null;
  caption: string | null;
  captured_at: string;
  byte_size: number | null;
}

export interface Expense {
  id: Uuid;
  spent_on: IsoDate;
  vendor: string;
  net_pence: PenceColumn;
  vat_pence: PenceColumn;
  gross_pence: PenceColumn;
  category_slug: string;
  entity: ExpenseEntity;
  business_percent: number;
  is_capital_asset: boolean;
  disallowable: boolean;
  project_id: Uuid | null;
  recurring_cost_id: Uuid | null;
  attachment_path: string | null;
  source: RecordSource;
}

export interface ExpenseWithProject extends Expense {
  projects: Pick<Project, "name"> | null;
}

export interface Contact {
  id: Uuid;
  client_id: Uuid | null;
  name: string;
  email: string | null;
  role: string | null;
}

export interface ContactWithClient extends Contact {
  clients: Pick<Client, "name"> | null;
}

export type EmailThreadKind =
  | "enquiry" | "scope_change" | "invoice_reply" | "payment_confirmation"
  | "receipt" | "subscription_charge" | "other";

export interface EmailThread {
  id: Uuid;
  external_id: string;
  client_id: Uuid | null;
  project_id: Uuid | null;
  subject: string;
  from_name: string | null;
  from_address: string;
  snippet: string | null;
  kind: EmailThreadKind;
  matched_by: "domain" | "address" | "subject" | "manual" | "unmatched";
  received_at: string;
}
