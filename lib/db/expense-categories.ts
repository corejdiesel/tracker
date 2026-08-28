/**
 * A minimal, entity-agnostic expense taxonomy — deliberately not the SA103-box
 * categories in getsorted.tax, since a company return doesn't file against
 * those boxes. Kept small on purpose: broaden it when the tax module needs a
 * category it can't map, not speculatively.
 */
export interface ExpenseCategory {
  slug: string;
  label: string;
  hint: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { slug: "office-and-equipment", label: "Office & equipment", hint: "Software, hardware under £1,000, stationery" },
  { slug: "professional-fees", label: "Professional fees", hint: "Accountant, legal, other advisers" },
  { slug: "travel", label: "Travel", hint: "Rail, flights, mileage, parking" },
  { slug: "subsistence", label: "Subsistence", hint: "Meals while travelling for work" },
  { slug: "marketing", label: "Marketing", hint: "Ads, site hosting, design for self-promotion" },
  { slug: "subcontractors", label: "Subcontractors", hint: "Freelancers or other companies engaged on client work" },
  { slug: "insurance", label: "Insurance", hint: "PI, PL, D&O" },
  { slug: "bank-and-finance", label: "Bank & finance charges", hint: "Fees, interest, FX charges" },
  { slug: "capital-asset", label: "Capital asset", hint: "Equipment over £1,000 — tick “Capital asset” below" },
  { slug: "other", label: "Other", hint: "" },
];
