import { toCsv } from "./csv";

const ZERO = BigInt(0);

/** Plain decimal pounds for a spreadsheet — "1234.56", never "£1,234.56".
 * A currency symbol or thousands separator in a numeric CSV column forces
 * every accounting tool to re-parse it as text before it can sum the
 * column; this is written to be pasted straight into a spreadsheet. */
function poundsDecimal(pence: number | string | bigint | null | undefined): string {
  const asPence =
    typeof pence === "bigint" ? pence : BigInt(Math.round(Number(pence ?? 0)));
  const negative = asPence < ZERO;
  const abs = negative ? -asPence : asPence;
  const pounds = abs / BigInt(100);
  const remainder = (abs % BigInt(100)).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${pounds}.${remainder}`;
}

export interface ExportInput {
  clients: readonly Record<string, unknown>[];
  contacts: readonly Record<string, unknown>[];
  projects: readonly Record<string, unknown>[];
  engagementWindows: readonly Record<string, unknown>[];
  tasks: readonly Record<string, unknown>[];
  invoices: readonly Record<string, unknown>[];
  invoiceLineItems: readonly Record<string, unknown>[];
  expenses: readonly Record<string, unknown>[];
  recurringCosts: readonly Record<string, unknown>[];
  timeEntries: readonly Record<string, unknown>[];
  taxObligations: readonly Record<string, unknown>[];
  artefacts: readonly Record<string, unknown>[];
}

/** Which `*_pence` columns each table carries — the caller passes raw DB
 * rows straight through; the `_pounds` conversion happens here, once, so
 * there's no way to forget it for a given table the way there would be if
 * every call site had to remember to pre-map its own rows. */
const PENCE_COLUMNS: Record<keyof ExportInput, readonly string[]> = {
  clients: [],
  contacts: [],
  projects: ["fee_pence", "day_rate_pence"],
  engagementWindows: [],
  tasks: [],
  invoices: ["subtotal_pence", "vat_pence", "total_pence"],
  invoiceLineItems: ["unit_price_pence"],
  expenses: ["net_pence", "vat_pence", "gross_pence"],
  recurringCosts: ["amount_pence"],
  timeEntries: [],
  taxObligations: ["estimated_pence"],
  artefacts: [],
};

/** One CSV file per table, keyed by the filename it should be written as
 * inside the export archive. Pure — no I/O, so it's testable without a
 * database or the zip step, and the zip step (build-export-archive.ts,
 * which imports jszip) stays a thin wrapper around this. */
export function buildExportCsvs(rawData: ExportInput): Record<string, string> {
  const data = Object.fromEntries(
    (Object.keys(rawData) as (keyof ExportInput)[]).map((table) => [
      table,
      withPoundsFields(rawData[table], PENCE_COLUMNS[table]),
    ])
  ) as unknown as ExportInput;

  return {
    "clients.csv": toCsv(data.clients, [
      { key: "id", header: "ID" },
      { key: "name", header: "Name" },
      { key: "company_number", header: "Company number" },
      { key: "vat_number", header: "VAT number" },
      { key: "vat_treatment", header: "VAT treatment" },
      { key: "payment_terms_days", header: "Payment terms (days)" },
      { key: "notes", header: "Notes" },
    ]),

    "contacts.csv": toCsv(data.contacts, [
      { key: "id", header: "ID" },
      { key: "client_id", header: "Client ID" },
      { key: "name", header: "Name" },
      { key: "email", header: "Email" },
      { key: "role", header: "Role" },
    ]),

    "projects.csv": toCsv(data.projects, [
      { key: "id", header: "ID" },
      { key: "client_id", header: "Client ID" },
      { key: "name", header: "Name" },
      { key: "status", header: "Status" },
      { key: "fee_structure", header: "Fee structure" },
      { key: "fee_pounds", header: "Fee (£)" },
      { key: "day_rate_pounds", header: "Day rate (£)" },
      { key: "estimated_days", header: "Estimated days" },
      { key: "probability", header: "Probability (%)" },
      { key: "starts_on", header: "Starts" },
      { key: "ends_on", header: "Ends" },
    ]),

    "engagement-windows.csv": toCsv(data.engagementWindows, [
      { key: "id", header: "ID" },
      { key: "project_id", header: "Project ID" },
      { key: "starts_on", header: "Starts" },
      { key: "ends_on", header: "Ends" },
      { key: "days_committed", header: "Days committed" },
      { key: "note", header: "Note" },
    ]),

    "tasks.csv": toCsv(data.tasks, [
      { key: "id", header: "ID" },
      { key: "project_id", header: "Project ID" },
      { key: "title", header: "Title" },
      { key: "due_on", header: "Due" },
      { key: "status", header: "Status" },
      { key: "source", header: "Source" },
    ]),

    "invoices.csv": toCsv(data.invoices, [
      { key: "id", header: "ID" },
      { key: "client_id", header: "Client ID" },
      { key: "project_id", header: "Project ID" },
      { key: "number", header: "Number" },
      { key: "issue_date", header: "Issue date" },
      { key: "due_date", header: "Due date" },
      { key: "subtotal_pounds", header: "Subtotal (£)" },
      { key: "vat_pounds", header: "VAT (£)" },
      { key: "total_pounds", header: "Total (£)" },
      { key: "status", header: "Status" },
      { key: "paid_on", header: "Paid on" },
    ]),

    "invoice-line-items.csv": toCsv(data.invoiceLineItems, [
      { key: "id", header: "ID" },
      { key: "invoice_id", header: "Invoice ID" },
      { key: "description", header: "Description" },
      { key: "quantity", header: "Quantity" },
      { key: "unit_price_pounds", header: "Unit price (£)" },
      { key: "vat_rate", header: "VAT rate (%)" },
    ]),

    "expenses.csv": toCsv(data.expenses, [
      { key: "id", header: "ID" },
      { key: "spent_on", header: "Date" },
      { key: "vendor", header: "Vendor" },
      { key: "net_pounds", header: "Net (£)" },
      { key: "vat_pounds", header: "VAT (£)" },
      { key: "gross_pounds", header: "Gross (£)" },
      { key: "category_slug", header: "Category" },
      { key: "entity", header: "Entity" },
      { key: "business_percent", header: "Business use (%)" },
      { key: "is_capital_asset", header: "Capital asset" },
      { key: "disallowable", header: "Disallowable" },
      { key: "project_id", header: "Project ID" },
    ]),

    "recurring-costs.csv": toCsv(data.recurringCosts, [
      { key: "id", header: "ID" },
      { key: "vendor", header: "Vendor" },
      { key: "amount_pounds", header: "Amount (£)" },
      { key: "cadence", header: "Cadence" },
      { key: "next_charge_on", header: "Next charge" },
      { key: "category_slug", header: "Category" },
      { key: "dependency", header: "Dependency" },
      { key: "active", header: "Active" },
    ]),

    "time-entries.csv": toCsv(data.timeEntries, [
      { key: "id", header: "ID" },
      { key: "project_id", header: "Project ID" },
      { key: "worked_on", header: "Date" },
      { key: "minutes", header: "Minutes" },
      { key: "billable", header: "Billable" },
      { key: "note", header: "Note" },
      { key: "source", header: "Source" },
    ]),

    "tax-obligations.csv": toCsv(data.taxObligations, [
      { key: "id", header: "ID" },
      { key: "kind", header: "Kind" },
      { key: "period_start", header: "Period start" },
      { key: "period_end", header: "Period end" },
      { key: "deadline", header: "Deadline" },
      { key: "estimated_pounds", header: "Estimated (£)" },
      { key: "status", header: "Status" },
      { key: "notes", header: "Notes" },
    ]),

    "work-artefacts.csv": toCsv(data.artefacts, [
      { key: "id", header: "ID" },
      { key: "project_id", header: "Project ID" },
      { key: "time_entry_id", header: "Time entry ID" },
      { key: "kind", header: "Kind" },
      { key: "url", header: "URL (links only — screenshots are not bundled in this export, see README)" },
      { key: "caption", header: "Caption" },
      { key: "captured_at", header: "Captured at" },
    ]),
  };
}

/** Rewrites `*_pence` columns to `*_pounds` decimal strings in place, for
 * every row, so the CSV builder above can reference the `_pounds` keys
 * directly. Centralised here rather than repeated per entity. */
export function withPoundsFields<T extends Record<string, unknown>>(
  rows: readonly T[],
  penceColumns: readonly string[]
): Record<string, unknown>[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const col of penceColumns) {
      if (col in out) {
        out[col.replace(/_pence$/, "_pounds")] = poundsDecimal(
          out[col] as number | string | bigint | null
        );
      }
    }
    return out;
  });
}

export const README_TEXT = `Freelance OS — data export
===========================

Generated automatically. Every table is exported as one CSV file, one row
per record. Money columns are plain decimals in pounds (e.g. "1234.56"),
not currency-formatted, so they paste straight into a spreadsheet.

Soft-deleted rows are excluded — this is your live data, not a full
history. IDs are stable UUIDs; use them to join CSVs where needed (e.g.
"expenses.csv" -> "project_id" -> "projects.csv" -> "id").

work-artefacts.csv lists screenshots and links captured against a project
or session, but does NOT include the screenshot image files themselves —
those live in private cloud storage and are not bundled here yet. The
"url" column only has a value for link-type artefacts.

This export reflects an estimate where the app shows one (e.g. the Tax
page's calculator) — nothing here has been filed with HMRC or represents
a submitted position.
`;
