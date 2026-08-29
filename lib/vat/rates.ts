/**
 * UK VAT rates and thresholds.
 *
 * Sourced from gov.uk directly, fetched 29 Aug 2026 — see the citation on
 * each field. Unlike `lib/tax-company/rates.ts`'s Corporation Tax and
 * dividend rates, these don't change on a fixed annual cadence (the
 * standard rate has been unchanged since 2011; the registration threshold
 * moves only when a Budget raises it), so this is one "current" entry
 * rather than a rates-by-tax-year table — but structured the same way
 * (`Record<Key, Rates>`, never a bare module constant) so a rate change
 * becomes a new labelled entry, not an edit to the numbers in place.
 */

export interface VatRates {
  /** Source: https://www.gov.uk/vat-rates (fetched 29 Aug 2026) — unchanged
   * since 4 Jan 2011. Reduced (5%) and zero (0%) rates exist for specific
   * goods/services but aren't modelled here — nothing in this app currently
   * needs to classify a sale or purchase by VAT rate beyond the amount
   * actually charged, which invoices and expenses already store directly. */
  standardRatePercent: number;
  /**
   * VAT registration threshold: taxable turnover over this in any rolling
   * 12-month period. Source: https://www.gov.uk/register-for-vat (fetched
   * 29 Aug 2026): "Businesses have to register for VAT if their VAT
   * taxable turnover is more than £90,000" — effective from 1 April 2024.
   * A business must ALSO register if it expects to exceed this in the next
   * 30 days alone; that trigger depends on a forward-looking estimate this
   * app has no data for, so `lib/vat/threshold.ts` only checks the
   * rolling-12-month figure, and the VAT page tells the user about the
   * 30-day rule as something to judge for themselves.
   */
  registrationThresholdPence: bigint;
}

export type VatRateSet = "current";

export const VAT_RATES: Record<VatRateSet, VatRates> = {
  current: {
    standardRatePercent: 20,
    registrationThresholdPence: BigInt(9_000_000), // £90,000
  },
};
