"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServerSupabase } from "@/lib/supabase/server";
import { parsePounds } from "@/lib/money";
import { isIsoDate } from "@/lib/dates";

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
