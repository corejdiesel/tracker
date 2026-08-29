import { Card } from "@/components/ui/primitives";
import { PageBody, PageHeader } from "@/components/ui/page";
import { TaxCalculator } from "@/components/tax/TaxCalculator";
import { VatNineBoxPreview, VatThreshold, type VatPeriodOption } from "@/components/tax/VatSection";
import { aggregateVatPeriod, estimateTrailingCompanyProfit } from "@/lib/db/queries";
import { formatMoney } from "@/lib/money";
import { addDays, todayIso } from "@/lib/dates";
import { computeStandardNineBox } from "@/lib/vat/nine-box";
import { recentVatPeriods } from "@/lib/vat/periods";
import { checkRegistrationThreshold } from "@/lib/vat/threshold";

export const metadata = { title: "Tax · Freelance OS" };

const VAT_PERIODS_SHOWN = 4;

export default async function TaxPage() {
  const today = todayIso();
  const since = addDays(today, -365);
  const { incomePence, expensesPence } = await estimateTrailingCompanyProfit(since);
  const defaultProfitPence = incomePence - expensesPence;

  const thresholdCheck = checkRegistrationThreshold(incomePence, today);

  const periods = recentVatPeriods(VAT_PERIODS_SHOWN, today);
  const vatPeriodOptions: VatPeriodOption[] = await Promise.all(
    periods.map(async (period) => {
      const aggregate = await aggregateVatPeriod(period.startsOn, period.endsOn);
      return {
        label: period.label,
        dueOn: period.dueOn,
        nineBox: computeStandardNineBox(aggregate),
      };
    })
  );

  return (
    <>
      <PageHeader
        title="Tax"
        subtitle="Company, personal, and VAT — modelled together, nothing here is filed"
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

        <VatThreshold check={thresholdCheck} />
        <VatNineBoxPreview periods={vatPeriodOptions} />
      </PageBody>
    </>
  );
}
