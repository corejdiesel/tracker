import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildExportCsvs, README_TEXT } from "./build-export";

describe("real jszip round-trip", () => {
  // Not redundant with build-export.test.ts: that suite checks the CSV
  // strings buildExportCsvs produces, which is pure string logic and needs
  // no I/O. This test exists specifically to exercise jszip for real —
  // generateAsync, and the `archive as unknown as BlobPart` cast in
  // app/api/export/route.ts (needed because jszip's uint8array output type
  // is generically Uint8Array<ArrayBufferLike> while BlobPart wants the
  // narrower Uint8Array<ArrayBuffer> in this TypeScript version) — so that
  // cast is verified to produce a correct zip, not just accepted by tsc.
  it("produces a real, re-readable zip with correctly preserved CSV content", async () => {
    const csvs = buildExportCsvs({
      clients: [{ id: "c1", name: "Alice, Ltd" }],
      contacts: [], projects: [], engagementWindows: [], tasks: [],
      invoices: [{ id: "i1", number: "INV-1", subtotal_pence: 100000, vat_pence: 20000, total_pence: 120000, status: "sent" }],
      invoiceLineItems: [], expenses: [], recurringCosts: [], timeEntries: [],
      taxObligations: [], artefacts: [],
    });

    const zip = new JSZip();
    zip.file("README.txt", README_TEXT);
    for (const [name, content] of Object.entries(csvs)) zip.file(name, content);

    const archive = await zip.generateAsync({ type: "uint8array" });
    expect(archive.length).toBeGreaterThan(0);

    // Exactly what the route does with the bytes before handing them to
    // Response — proves the Blob([archive as unknown as BlobPart]) cast in
    // app/api/export/route.ts doesn't silently produce garbage.
    const blob = new Blob([archive as unknown as BlobPart], { type: "application/zip" });
    const roundTripBytes = new Uint8Array(await blob.arrayBuffer());
    expect(roundTripBytes).toEqual(archive);

    const reread = await JSZip.loadAsync(archive);
    expect(Object.keys(reread.files).sort()).toEqual(
      ["README.txt", ...Object.keys(csvs)].sort()
    );

    const clientsCsv = await reread.file("clients.csv")!.async("string");
    expect(clientsCsv).toBe(csvs["clients.csv"]);
    expect(clientsCsv).toContain('"Alice, Ltd"');

    const invoicesCsv = await reread.file("invoices.csv")!.async("string");
    expect(invoicesCsv).toContain("1000.00"); // subtotal
    expect(invoicesCsv).toContain("200.00");  // vat
    expect(invoicesCsv).toContain("1200.00"); // total
  });
});
