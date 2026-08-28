import JSZip from "jszip";
import { buildExportCsvs, README_TEXT } from "@/lib/export/build-export";
import { getUser } from "@/lib/supabase/server";
import {
  listClients, listContacts, listEngagementWindows, listExpenses,
  listInvoiceLineItems, listInvoices, listProjects, listRecurringCosts,
  listAllArtefactMetadata, listAllTasks, listTaxObligations, listTimeEntries,
} from "@/lib/db/queries";

/**
 * §8 non-negotiable: "Full data export to a portable format, always
 * available. I need to be able to hand my accountant a folder and leave."
 *
 * A GET so it's a plain link/button, not a form — RLS still scopes every
 * query to the signed-in user underneath this, but the explicit `getUser()`
 * check below means an unauthenticated request gets a clean 401 rather than
 * an empty zip that looks like a bug.
 */
export async function GET() {
  const user = await getUser();
  if (!user) {
    return new Response("Sign in to export your data.", { status: 401 });
  }

  const [
    clients, contacts, projects, engagementWindows, tasks, invoices,
    invoiceLineItems, expenses, recurringCosts, timeEntries, taxObligations,
    artefacts,
  ] = await Promise.all([
    listClients(), listContacts(), listProjects(), listEngagementWindows(),
    listAllTasks(), listInvoices(), listInvoiceLineItems(), listExpenses(),
    listRecurringCosts(), listTimeEntries(), listTaxObligations(),
    listAllArtefactMetadata(),
  ]);

  // The domain row types (InvoiceWithClient etc.) carry every field the
  // export needs but, being explicit interfaces rather than index-signature
  // types, don't structurally satisfy Record<string, unknown> — the export
  // builder only reads specific known keys off each row, so this cast is
  // safe rather than a type-safety hole.
  const csvs = buildExportCsvs({
    clients, contacts, projects, engagementWindows, tasks, invoices,
    invoiceLineItems, expenses, recurringCosts, timeEntries, taxObligations,
    artefacts,
  } as unknown as Parameters<typeof buildExportCsvs>[0]);

  const zip = new JSZip();
  zip.file("README.txt", README_TEXT);
  for (const [filename, content] of Object.entries(csvs)) {
    zip.file(filename, content);
  }

  const archive = await zip.generateAsync({ type: "uint8array" });
  const today = new Date().toISOString().slice(0, 10);

  // jszip's `uint8array` output type is generically `Uint8Array<ArrayBufferLike>`
  // (it could in principle be backed by a SharedArrayBuffer), while
  // BlobPart/BodyInit in this TypeScript version require the narrower
  // `Uint8Array<ArrayBuffer>`. It never actually IS a SharedArrayBuffer here
  // — jszip allocates a plain one — so this is a nominal-typing artifact,
  // not a real runtime hazard; confirmed by fetching this route for real
  // and diffing the response against the source CSVs (see the commit this
  // shipped in) rather than just silencing the error.
  const blob = new Blob([archive as unknown as BlobPart], { type: "application/zip" });

  return new Response(blob, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="freelance-os-export-${today}.zip"`,
      "Content-Length": String(archive.length),
    },
  });
}
