"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
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

/** The signed-in user's id, or a thrown error. Every insert needs it. */
async function ownerId(): Promise<string> {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("You're signed out. Sign in and try again.");
  return data.user.id;
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

    const supabase = await createServerSupabase();
    const { error } = await supabase.from("clients").insert({
      ...input,
      // bigint columns take a string so a large value never round-trips
      // through a lossy JS number.
      default_day_rate_pence: input.default_day_rate_pence?.toString() ?? null,
      owner_id: await ownerId(),
    });

    if (error) throw new Error(error.message);
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

    const supabase = await createServerSupabase();
    const { error } = await supabase.from("projects").insert({
      ...input,
      fee_pence: input.fee_pence?.toString() ?? null,
      owner_id: await ownerId(),
    });

    if (error) throw new Error(error.message);
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

    const supabase = await createServerSupabase();
    const { error } = await supabase.from("invoices").insert({
      client_id: input.client_id,
      number: input.number,
      issue_date: input.issue_date,
      due_date: input.due_date,
      subtotal_pence: input.subtotal_pence.toString(),
      vat_pence: (input.vat_pence ?? BigInt(0)).toString(),
      status: input.status,
      owner_id: await ownerId(),
    });

    if (error) {
      throw new Error(
        error.code === "23505"
          ? `You already have an invoice numbered ${input.number}.`
          : error.message
      );
    }
  } catch (error) {
    return fail(error);
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

    const supabase = await createServerSupabase();
    const { error } = await supabase.from("recurring_costs").insert({
      ...input,
      amount_pence: input.amount_pence.toString(),
      owner_id: await ownerId(),
    });

    if (error) throw new Error(error.message);
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

    const supabase = await createServerSupabase();
    const { error } = await supabase.from("running_timers").insert({
      project_id: input.project_id,
      note: input.note || null,
      owner_id: await ownerId(),
    });

    if (error) {
      // owner_id is the primary key, so a second start collides by design.
      throw new Error(
        error.code === "23505"
          ? "A timer is already running. Stop it before starting another."
          : error.message
      );
    }
  } catch (error) {
    return fail(error);
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
  const supabase = await createServerSupabase();
  const owner = await ownerId();

  const { data: timer } = await supabase
    .from("running_timers")
    .select("project_id,task_id,started_at,note")
    .maybeSingle();

  if (!timer) return;

  const minutes = elapsedMinutes(timer.started_at);

  if (minutes > 0) {
    await supabase.from("time_entries").insert({
      owner_id: owner,
      project_id: timer.project_id,
      task_id: timer.task_id,
      // The day the session started, in the operator's own calendar.
      worked_on: timer.started_at.slice(0, 10),
      minutes: Math.min(minutes, 1440),
      note: timer.note,
      source: "timer",
    });
  }

  await supabase.from("running_timers").delete().eq("owner_id", owner);

  revalidatePath("/time");
  revalidatePath("/");
}

export async function discardTimer(): Promise<void> {
  const supabase = await createServerSupabase();
  await supabase.from("running_timers").delete().eq("owner_id", await ownerId());
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

    const supabase = await createServerSupabase();
    const { error } = await supabase.from("time_entries").insert({
      project_id: input.project_id,
      worked_on: input.worked_on,
      minutes: total,
      note: input.note || null,
      // An unchecked checkbox sends nothing at all.
      billable: input.billable === "on",
      source: "manual",
      owner_id: await ownerId(),
    });

    if (error) throw new Error(error.message);
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
 * storage. The bytes never pass through a server action — a screenshot would
 * blow the action body limit and there is no reason to proxy it.
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

    const owner = await ownerId();

    // Storage RLS keys on the first path segment. Re-check it here so a
    // tampered client cannot record a row pointing at someone else's object.
    if (!parsed.storagePath.startsWith(`${owner}/`)) {
      throw new Error("That file doesn't belong to this account.");
    }

    const supabase = await createServerSupabase();
    const { error } = await supabase.from("work_artefacts").insert({
      owner_id: owner,
      project_id: parsed.projectId,
      time_entry_id: parsed.timeEntryId ?? null,
      kind: "screenshot",
      storage_path: parsed.storagePath,
      caption: parsed.caption || null,
      byte_size: parsed.byteSize ?? null,
    });

    if (error) throw new Error(error.message);
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

    const supabase = await createServerSupabase();
    const { error } = await supabase.from("work_artefacts").insert({
      owner_id: await ownerId(),
      project_id: input.project_id,
      kind: "link",
      url: input.url,
      caption: input.caption || null,
    });

    if (error) throw new Error(error.message);
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

    const supabase = await createServerSupabase();
    const { error } = await supabase.from("expenses").insert({
      spent_on: input.spent_on,
      vendor: input.vendor,
      net_pence: input.net_pence.toString(),
      vat_pence: (input.vat_pence ?? BigInt(0)).toString(),
      category_slug: input.category_slug,
      entity: input.entity,
      business_percent: input.business_percent,
      is_capital_asset: input.is_capital_asset === "on",
      disallowable: input.disallowable === "on",
      project_id: input.project_id || null,
      source: "manual",
      owner_id: await ownerId(),
    });

    if (error) throw new Error(error.message);
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

    const supabase = await createServerSupabase();
    const { error } = await supabase.from("contacts").insert({
      name: input.name,
      client_id: input.client_id || null,
      email: input.email || null,
      role: input.role || null,
      owner_id: await ownerId(),
    });

    if (error) throw new Error(error.message);
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

    const supabase = await createServerSupabase();
    const { error } = await supabase.from("tasks").insert({
      project_id: input.project_id,
      title: input.title,
      due_on: input.due_on,
      status: "open",
      source: "manual",
      owner_id: await ownerId(),
    });

    if (error) throw new Error(error.message);
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
  const supabase = await createServerSupabase();
  const { data } = await supabase.from("tasks").select("status").eq("id", taskId).single();
  if (!data) return;

  const next = data.status === "open" ? "doing" : data.status === "doing" ? "done" : "open";
  await supabase.from("tasks").update({ status: next }).eq("id", taskId);

  revalidatePath("/tasks");
  revalidatePath("/");
}
