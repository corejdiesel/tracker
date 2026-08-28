"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUserId } from "@/lib/auth/session";
import { withUser } from "./client";
import { parsePounds } from "@/lib/money";
import { isIsoDate } from "@/lib/dates";
import { elapsedMinutes } from "./time";

export interface FormState {
  error?: string;
}

/** A pounds field that must be present. Rejects negatives and >2dp. */
const pounds = z.string().transform((raw, ctx) => {
  const pence = parsePounds(raw);
  if (pence === null) {
    ctx.addIssue({ code: "custom", message: `"${raw}" isn't a valid amount.` });
    return z.NEVER;
  }
  return pence;
});

/** An optional pounds field — blank means "not set", not zero. */
const optionalPounds = z.string().transform((raw, ctx) => {
  if (raw.trim() === "") return null;
  const pence = parsePounds(raw);
  if (pence === null) {
    ctx.addIssue({ code: "custom", message: `"${raw}" isn't a valid amount.` });
    return z.NEVER;
  }
  return pence;
});

const isoDate = z.string().refine(isIsoDate, "Enter a valid date.");

function fail(error: unknown): FormState {
  if (error instanceof z.ZodError) {
    return { error: error.issues[0]?.message ?? "Check the form and try again." };
  }
  return { error: error instanceof Error ? error.message : "Something went wrong." };
}

/** A unique-violation from Postgres (`23505`) — the Neon driver's thrown
 * error carries the standard Postgres error `code`, confirmed against a
 * real duplicate-key failure while verifying the schema against a live
 * database, not assumed. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === "23505";
}

/** The signed-in user's id, and a scoped query connection for them — every
 * write needs both. Throws if signed out, same as the queries module. */
async function db() {
  const userId = await getSessionUserId();
  if (!userId) throw new Error("You're signed out. Sign in and try again.");
  return withUser(userId);
}

/* Clients ──────────────────────────────────────────────────────────────────*/

const clientInput = z.object({
  name: z.string().trim().min(1, "Give the client a name."),
  payment_terms_days: z.coerce.number().int().min(0).max(365),
  vat_treatment: z.enum(["standard", "reverse_charge", "exempt", "outside_scope"]),
  default_day_rate_pence: optionalPounds,
  company_number: z.string().trim().nullable().transform((v) => v || null),
  vat_number: z.string().trim().nullable().transform((v) => v || null),
});

export async function createClient(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = clientInput.parse({
      name: formData.get("name"),
      payment_terms_days: formData.get("payment_terms_days"),
      vat_treatment: formData.get("vat_treatment"),
      default_day_rate_pence: formData.get("default_day_rate_pence") ?? "",
      company_number: formData.get("company_number"),
      vat_number: formData.get("vat_number"),
    });

    const conn = await db();
    await conn.query(
      `insert into public.clients
         (owner_id, name, payment_terms_days, vat_treatment, default_day_rate_pence,
          company_number, vat_number)
       values ((select public.app_user_id()), $1, $2, $3, $4, $5, $6)`,
      [
        input.name,
        input.payment_terms_days,
        input.vat_treatment,
        // bigint columns take a string so a large value never round-trips
        // through a lossy JS number.
        input.default_day_rate_pence?.toString() ?? null,
        input.company_number,
        input.vat_number,
      ]
    );
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/clients");
  return {};
}

/* Projects ─────────────────────────────────────────────────────────────────*/

const projectInput = z.object({
  client_id: z.uuid("Pick a client."),
  name: z.string().trim().min(1, "Give the project a name."),
  status: z.enum(["pitching", "won", "active", "delivered", "invoiced", "paid", "dead"]),
  fee_structure: z.enum(["fixed", "day_rate", "retainer"]),
  fee_pence: optionalPounds,
  estimated_days: z.string().transform((v) => (v.trim() === "" ? null : Number(v))),
  probability: z.string().transform((v) => (v.trim() === "" ? null : Number(v))),
  starts_on: z.string().transform((v) => (v.trim() === "" ? null : v)),
  ends_on: z.string().transform((v) => (v.trim() === "" ? null : v)),
});

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = projectInput.parse(Object.fromEntries(formData));

    if (input.starts_on && !isIsoDate(input.starts_on)) throw new Error("Start date isn't valid.");
    if (input.ends_on && !isIsoDate(input.ends_on)) throw new Error("End date isn't valid.");
    if (input.starts_on && input.ends_on && input.ends_on < input.starts_on) {
      throw new Error("The project can't end before it starts.");
    }

    const conn = await db();
    await conn.query(
      `insert into public.projects
         (owner_id, client_id, name, status, fee_structure, fee_pence,
          estimated_days, probability, starts_on, ends_on)
       values ((select public.app_user_id()), $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        input.client_id, input.name, input.status, input.fee_structure,
        input.fee_pence?.toString() ?? null, input.estimated_days, input.probability,
        input.starts_on, input.ends_on,
      ]
    );
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/projects");
  return {};
}

/* Invoices ─────────────────────────────────────────────────────────────────*/

const invoiceInput = z.object({
  client_id: z.uuid("Pick a client."),
  number: z.string().trim().min(1, "Give the invoice a number."),
  issue_date: isoDate,
  due_date: isoDate,
  subtotal_pence: pounds,
  vat_pence: optionalPounds,
  status: z.enum(["draft", "scheduled", "sent", "paid", "overdue", "written_off"]),
});

export async function createInvoice(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = invoiceInput.parse(Object.fromEntries(formData));

    if (input.due_date < input.issue_date) {
      throw new Error("An invoice can't be due before it's issued.");
    }
    // The DB enforces this too; catching it here gives a readable message
    // instead of a constraint name.
    if (input.status === "paid") {
      throw new Error("Create the invoice first, then mark it paid — that records the date.");
    }

    const conn = await db();
    await conn.query(
      `insert into public.invoices
         (owner_id, client_id, number, issue_date, due_date, subtotal_pence, vat_pence, status)
       values ((select public.app_user_id()), $1, $2, $3, $4, $5, $6, $7)`,
      [
        input.client_id, input.number, input.issue_date, input.due_date,
        input.subtotal_pence.toString(), (input.vat_pence ?? BigInt(0)).toString(), input.status,
      ]
    );
  } catch (error) {
    return fail(
      isUniqueViolation(error) ? new Error(`You already have an invoice numbered ${JSON.stringify(formData.get("number"))}.`) : error
    );
  }

  revalidatePath("/invoices");
  revalidatePath("/");
  return {};
}

/* Recurring costs ──────────────────────────────────────────────────────────*/

const costInput = z.object({
  vendor: z.string().trim().min(1, "Who charges it?"),
  amount_pence: pounds,
  cadence: z.enum(["monthly", "quarterly", "annual"]),
  next_charge_on: isoDate,
  category_slug: z.string().trim().min(1, "Pick a category."),
  cancel_by: z.string().transform((v) => (v.trim() === "" ? null : v)),
  dependency: z.enum(["hard", "discretionary"]),
});

export async function createRecurringCost(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = costInput.parse(Object.fromEntries(formData));
    if (input.cancel_by && !isIsoDate(input.cancel_by)) {
      throw new Error("Cancel-by isn't a valid date.");
    }

    const conn = await db();
    await conn.query(
      `insert into public.recurring_costs
         (owner_id, vendor, amount_pence, cadence, next_charge_on, category_slug,
          cancel_by, dependency)
       values ((select public.app_user_id()), $1, $2, $3, $4, $5, $6, $7)`,
      [
        input.vendor, input.amount_pence.toString(), input.cadence, input.next_charge_on,
        input.category_slug, input.cancel_by, input.dependency,
      ]
    );
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/costs");
  revalidatePath("/");
  return {};
}

/* Time tracking ────────────────────────────────────────────────────────────*/

export async function startTimer(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = z
      .object({ project_id: z.uuid("Pick a project."), note: z.string().trim().optional() })
      .parse(Object.fromEntries(formData));

    const conn = await db();
    await conn.query(
      `insert into public.running_timers (owner_id, project_id, note)
       values ((select public.app_user_id()), $1, $2)`,
      [input.project_id, input.note || null]
    );
  } catch (error) {
    // owner_id is the primary key, so a second start collides by design.
    return fail(
      isUniqueViolation(error)
        ? new Error("A timer is already running. Stop it before starting another.")
        : error
    );
  }

  revalidatePath("/time");
  return {};
}

/**
 * Stop the timer and write the session. Rounds elapsed time to the nearest
 * minute floor; a timer stopped inside its first minute is discarded rather
 * than recorded as zero, which the `minutes > 0` constraint would reject
 * anyway and which is not a session worth keeping.
 */
export async function stopTimer(): Promise<void> {
  const conn = await db();

  const rows = await conn.query<{
    project_id: string; task_id: string | null; started_at: string; note: string | null;
  }>(`select project_id, task_id, started_at, note from public.running_timers`);
  const timer = rows[0];
  if (!timer) return;

  const minutes = elapsedMinutes(timer.started_at);

  await conn.transaction((q) => {
    const queries = [];
    if (minutes > 0) {
      queries.push(
        q(
          `insert into public.time_entries
             (owner_id, project_id, task_id, worked_on, minutes, note, source)
           values ((select public.app_user_id()), $1, $2, $3, $4, $5, 'timer')`,
          [
            timer.project_id, timer.task_id,
            // The day the session started, in the operator's own calendar.
            timer.started_at.slice(0, 10),
            Math.min(minutes, 1440), timer.note,
          ]
        )
      );
    }
    queries.push(q(`delete from public.running_timers where owner_id = (select public.app_user_id())`));
    return queries;
  });

  revalidatePath("/time");
  revalidatePath("/");
}

export async function discardTimer(): Promise<void> {
  const conn = await db();
  await conn.query(`delete from public.running_timers where owner_id = (select public.app_user_id())`);
  revalidatePath("/time");
}

const timeEntryInput = z.object({
  project_id: z.uuid("Pick a project."),
  worked_on: isoDate,
  hours: z.coerce.number().min(0).max(24),
  minutes: z.coerce.number().int().min(0).max(59),
  note: z.string().trim().optional(),
  billable: z.string().optional(),
});

export async function logTime(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = timeEntryInput.parse(Object.fromEntries(formData));
    const total = Math.round(input.hours * 60) + input.minutes;

    if (total <= 0) throw new Error("Log at least a minute.");
    if (total > 1440) throw new Error("That's more than a day.");

    const conn = await db();
    await conn.query(
      `insert into public.time_entries (owner_id, project_id, worked_on, minutes, note, billable, source)
       values ((select public.app_user_id()), $1, $2, $3, $4, $5, 'manual')`,
      [
        input.project_id, input.worked_on, total, input.note || null,
        // An unchecked checkbox sends nothing at all.
        input.billable === "on",
      ]
    );
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/time");
  revalidatePath("/");
  return {};
}

/* Work artefacts ───────────────────────────────────────────────────────────*/

/**
 * Record an artefact after the browser has uploaded the file straight to
 * storage. DEFERRED (see lib/db/queries.ts's signArtefacts): there is no
 * Neon storage equivalent wired up yet, so nothing currently calls this
 * with a real storagePath — kept correct against the schema for when a
 * storage provider is chosen, rather than deleted.
 */
export async function recordArtefact(input: {
  projectId: string;
  timeEntryId?: string | null;
  storagePath: string;
  caption?: string | null;
  byteSize?: number | null;
}): Promise<FormState> {
  try {
    const parsed = z
      .object({
        projectId: z.uuid(),
        timeEntryId: z.uuid().nullable().optional(),
        storagePath: z.string().min(1),
        caption: z.string().trim().nullable().optional(),
        byteSize: z.number().int().min(0).nullable().optional(),
      })
      .parse(input);

    const conn = await db();
    await conn.query(
      `insert into public.work_artefacts
         (owner_id, project_id, time_entry_id, kind, storage_path, caption, byte_size)
       values ((select public.app_user_id()), $1, $2, 'screenshot', $3, $4, $5)`,
      [parsed.projectId, parsed.timeEntryId ?? null, parsed.storagePath, parsed.caption || null, parsed.byteSize ?? null]
    );
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/time");
  return {};
}

export async function addArtefactLink(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = z
      .object({
        project_id: z.uuid("Pick a project."),
        url: z.url("That isn't a valid URL."),
        caption: z.string().trim().optional(),
      })
      .parse(Object.fromEntries(formData));

    const conn = await db();
    await conn.query(
      `insert into public.work_artefacts (owner_id, project_id, kind, url, caption)
       values ((select public.app_user_id()), $1, 'link', $2, $3)`,
      [input.project_id, input.url, input.caption || null]
    );
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/time");
  return {};
}

/* Expenses ──────────────────────────────────────────────────────────────────*/

const expenseInput = z.object({
  spent_on: isoDate,
  vendor: z.string().trim().min(1, "Who was it paid to?"),
  net_pence: pounds,
  vat_pence: optionalPounds,
  category_slug: z.string().trim().min(1, "Pick a category."),
  entity: z.enum(["company", "personal"]),
  business_percent: z.coerce.number().int().min(1).max(100),
  is_capital_asset: z.string().optional(),
  disallowable: z.string().optional(),
  project_id: z.string().optional(),
});

export async function createExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = expenseInput.parse(Object.fromEntries(formData));

    const conn = await db();
    await conn.query(
      `insert into public.expenses
         (owner_id, spent_on, vendor, net_pence, vat_pence, category_slug, entity,
          business_percent, is_capital_asset, disallowable, project_id, source)
       values ((select public.app_user_id()), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'manual')`,
      [
        input.spent_on, input.vendor, input.net_pence.toString(),
        (input.vat_pence ?? BigInt(0)).toString(), input.category_slug, input.entity,
        input.business_percent, input.is_capital_asset === "on", input.disallowable === "on",
        input.project_id || null,
      ]
    );
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/expenses");
  revalidatePath("/");
  return {};
}

/* Contacts ──────────────────────────────────────────────────────────────────*/

const contactInput = z.object({
  name: z.string().trim().min(1, "Give the contact a name."),
  client_id: z.string().optional(),
  email: z.email("That doesn't look like an email address.").optional().or(z.literal("")),
  role: z.string().trim().optional(),
});

export async function createContact(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = contactInput.parse(Object.fromEntries(formData));

    const conn = await db();
    await conn.query(
      `insert into public.contacts (owner_id, name, client_id, email, role)
       values ((select public.app_user_id()), $1, $2, $3, $4)`,
      [input.name, input.client_id || null, input.email || null, input.role || null]
    );
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/contacts");
  return {};
}

/* Tasks ─────────────────────────────────────────────────────────────────────*/

const taskInput = z.object({
  project_id: z.uuid("Pick a project."),
  title: z.string().trim().min(1, "Give the task a title."),
  due_on: z.string().transform((v) => (v.trim() === "" ? null : v)),
});

export async function createTask(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = taskInput.parse(Object.fromEntries(formData));
    if (input.due_on && !isIsoDate(input.due_on)) throw new Error("Due date isn't valid.");

    const conn = await db();
    await conn.query(
      `insert into public.tasks (owner_id, project_id, title, due_on, status, source)
       values ((select public.app_user_id()), $1, $2, $3, 'open', 'manual')`,
      [input.project_id, input.title, input.due_on]
    );
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/tasks");
  revalidatePath("/");
  return {};
}

/** Cycles open → doing → done. A separate explicit action drops a task rather
 * than folding it into the cycle, so it never gets there by accident. */
export async function advanceTask(taskId: string): Promise<void> {
  const conn = await db();

  const rows = await conn.query<{ status: string }>(
    `select status from public.tasks where id = $1`,
    [taskId]
  );
  const current = rows[0];
  if (!current) return;

  const next = current.status === "open" ? "doing" : current.status === "doing" ? "done" : "open";
  await conn.query(`update public.tasks set status = $1 where id = $2`, [next, taskId]);

  revalidatePath("/tasks");
  revalidatePath("/");
}

/* Mail triage ───────────────────────────────────────────────────────────────*/

const resolveThreadInput = z.object({
  thread_id: z.uuid(),
  client_id: z.uuid("Pick a client."),
  project_id: z.string().optional(),
  // Whether to remember this so future mail from the same sender resolves
  // itself. Off by default for a shared inbox address (e.g. hello@agency.com
  // could plausibly be a different client next time); on by default for a
  // named person, per the checkbox default in the UI.
  remember_by: z.enum(["address", "domain", "just_this_once"]),
});

/**
 * Resolving a thread does two things atomically: sets this thread's own
 * match, and — unless the user said "just this once" — writes a
 * match_rules row so the SAME pattern (address or domain) never has to be
 * resolved again. This is the "resolve it once, it's remembered" promise
 * the brief makes for both mail and, later, Granola.
 */
export async function resolveThread(_prev: FormState, formData: FormData): Promise<FormState> {
  try {
    const input = resolveThreadInput.parse(Object.fromEntries(formData));
    const conn = await db();

    const threadRows = await conn.query<{ from_address: string }>(
      `select from_address from public.email_threads where id = $1`,
      [input.thread_id]
    );
    const thread = threadRows[0];
    if (!thread) throw new Error("That thread doesn't exist.");

    await conn.transaction((q) => {
      const queries = [
        q(
          `update public.email_threads set client_id = $1, project_id = $2, matched_by = 'manual'
             where id = $3`,
          [input.client_id, input.project_id || null, input.thread_id]
        ),
      ];

      if (input.remember_by !== "just_this_once") {
        const fromAddress = thread.from_address.toLowerCase();
        const pattern =
          input.remember_by === "address" ? fromAddress : fromAddress.split("@")[1];
        const kind = input.remember_by === "address" ? "address" : "email_domain";

        queries.push(
          q(
            `insert into public.match_rules (owner_id, kind, pattern, client_id, project_id)
             values ((select public.app_user_id()), $1, $2, $3, $4)
             on conflict (owner_id, kind, pattern) where deleted_at is null do nothing`,
            [kind, pattern, input.client_id, input.project_id || null]
          )
        );
      }
      return queries;
    });
  } catch (error) {
    return fail(error);
  }

  revalidatePath("/mail");
  return {};
}
