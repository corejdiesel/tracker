import { describe, expect, it } from "vitest";
import { buildExportCsvs, withPoundsFields, type ExportInput } from "./build-export";

const empty: ExportInput = {
  clients: [], contacts: [], projects: [], engagementWindows: [], tasks: [],
  invoices: [], invoiceLineItems: [], expenses: [], recurringCosts: [],
  timeEntries: [], taxObligations: [], artefacts: [],
};

describe("withPoundsFields", () => {
  it("converts a bigint pence column to a decimal pounds string", () => {
    const out = withPoundsFields([{ amount_pence: BigInt(123456) }], ["amount_pence"]);
    expect(out[0]!.amount_pounds).toBe("1234.56");
  });

  it("converts the number shape PostgREST actually returns for a bigint column", () => {
    const out = withPoundsFields([{ amount_pence: 123456 }], ["amount_pence"]);
    expect(out[0]!.amount_pounds).toBe("1234.56");
  });

  it("keeps two decimal places for a whole-pound amount", () => {
    const out = withPoundsFields([{ amount_pence: 500000 }], ["amount_pence"]);
    expect(out[0]!.amount_pounds).toBe("5000.00");
  });

  it("handles a negative amount without mangling the decimal point", () => {
    const out = withPoundsFields([{ amount_pence: -1250 }], ["amount_pence"]);
    expect(out[0]!.amount_pounds).toBe("-12.50");
  });

  it("treats a null pence value as zero rather than throwing", () => {
    const out = withPoundsFields([{ amount_pence: null }], ["amount_pence"]);
    expect(out[0]!.amount_pounds).toBe("0.00");
  });

  it("leaves the original pence column in place alongside the new one", () => {
    const out = withPoundsFields([{ amount_pence: 100 }], ["amount_pence"]);
    expect(out[0]!.amount_pence).toBe(100);
    expect(out[0]!.amount_pounds).toBe("1.00");
  });

  it("is a no-op for a table with no money columns", () => {
    const out = withPoundsFields([{ name: "Alice" }], []);
    expect(out[0]).toEqual({ name: "Alice" });
  });
});

describe("buildExportCsvs", () => {
  it("produces one CSV per table, each with at least a header, even with no data", () => {
    const csvs = buildExportCsvs(empty);
    const expectedFiles = [
      "clients.csv", "contacts.csv", "projects.csv", "engagement-windows.csv",
      "tasks.csv", "invoices.csv", "invoice-line-items.csv", "expenses.csv",
      "recurring-costs.csv", "time-entries.csv", "tax-obligations.csv",
      "work-artefacts.csv",
    ];
    for (const file of expectedFiles) {
      expect(csvs[file]).toBeDefined();
      expect(csvs[file]).toContain("\r\n"); // header line present
    }
  });

  it("renders a real expense row with its money columns as plain decimals", () => {
    const csvs = buildExportCsvs({
      ...empty,
      expenses: [{
        id: "e1", spent_on: "2026-08-26", vendor: "Adobe",
        net_pence: 5999, vat_pence: 1200, gross_pence: 7199,
        category_slug: "office-and-equipment", entity: "company",
        business_percent: 100, is_capital_asset: false, disallowable: false,
        project_id: null,
      }],
    });
    expect(csvs["expenses.csv"]).toContain("Adobe");
    expect(csvs["expenses.csv"]).toContain("59.99");
    expect(csvs["expenses.csv"]).toContain("12.00");
    expect(csvs["expenses.csv"]).toContain("71.99");
    // The raw pence value must NOT leak into the sheet an accountant reads.
    expect(csvs["expenses.csv"]).not.toContain("5999");
  });

  it("a vendor name with a comma survives round-trip-safe in the CSV", () => {
    const csvs = buildExportCsvs({
      ...empty,
      expenses: [{
        id: "e1", spent_on: "2026-08-26", vendor: "Smith, Jones & Co",
        net_pence: 100, vat_pence: 0, gross_pence: 100,
        category_slug: "other", entity: "company", business_percent: 100,
        is_capital_asset: false, disallowable: false, project_id: null,
      }],
    });
    expect(csvs["expenses.csv"]).toContain('"Smith, Jones & Co"');
  });
});
