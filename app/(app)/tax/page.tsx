import { Card } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/ui/page";
import { TaxCalculator } from "@/components/tax/TaxCalculator";
import { estimateTrailingCompanyProfit } from "@/lib/db/queries";
import { formatMoney } from "@/lib/money";
import { addDays, todayIso } from "@/lib/dates";

export const metadata = { title: "Tax · Freelance OS" };

export default async function TaxPage() {
  const since = addDays(todayIso(), -365);
  const { incomePence, expensesPence } = await estimateTrailingCompanyProfit(since);
  const defaultProfitPence = incomePence - expensesPence;

  return (
    <>
      <PageHeader
        title="Tax"
        subtitle="Company and personal tax, modelled together — nothing here is filed"
      />

      <PageBody>
        <Card className="px-4 py-3 text-sm text-ink-muted">
          The profit figure below defaults to {formatMoney(incomePence)} invoiced minus{" "}
          {formatMoney(expensesPence)} of company expenses over the last 12 months. That is
          <strong className="text-ink"> not an accounting profit</strong> — it doesn&rsquo;t
          account for unpaid invoices, prior-period adjustments, or anything not yet logged.
          Treat it as a starting point and adjust it.
        </Card>

        <TaxCalculator defaultProfitPence={defaultProfitPence} />
      </PageBody>
    </>
  );
}
