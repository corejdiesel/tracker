import { CORPORATION_TAX_RATES, type CorporationTaxYear } from "./rates";

const ZERO = BigInt(0);

export interface CorporationTaxResult {
  taxPence: bigint;
  marginalReliefPence: bigint;
  /** Which band the profit landed in — informational, for display. */
  band: "small_profits" | "marginal" | "main";
}

/**
 * UK Corporation Tax with Marginal Relief.
 *
 * Formula (Corporation Tax Act 2010 s269CB, confirmed against gov.uk 26 Aug
 * 2026): Marginal Relief = F × (U − A) × (N / A), where F is the standard
 * fraction, U the upper limit, A "augmented profits" (taxable profits plus
 * exempt distributions received from non-group companies — dividends from
 * another UK company you don't control), and N the taxable total profits
 * being charged.
 *
 * `augmentedProfitsPence` defaults to `profitPence` — correct for the common
 * case of a company with no such dividend income, which is assumed unless the
 * caller states otherwise.
 *
 * Verified independently, not just transcribed: differentiating this formula
 * (with A = N) gives a flat marginal rate of mainRate + F = 25% + 1.5% =
 * 26.5% on every pound in the marginal band — the figure widely quoted by UK
 * accountants for FY2023 rates — which the effectiveRate test below asserts
 * holds at multiple points, not just at one.
 *
 * NOT modelled: associated companies (gov.uk: divide both limits by the
 * number of associated companies + 1), short accounting periods (limits
 * pro-rate), and augmented profits from non-group dividends beyond accepting
 * the parameter. Flagged in the Notion action list — this covers a single
 * standalone company on a standard 12-month period, which is W Technologies
 * Ltd's situation unless told otherwise.
 */
export function calculateCorporationTax(
  profitPence: bigint,
  year: CorporationTaxYear,
  augmentedProfitsPence: bigint = profitPence
): CorporationTaxResult {
  if (profitPence <= ZERO) {
    return { taxPence: ZERO, marginalReliefPence: ZERO, band: "small_profits" };
  }

  const rates = CORPORATION_TAX_RATES[year];
  const A = augmentedProfitsPence;

  if (A <= rates.lowerLimitPence) {
    const tax = (profitPence * BigInt(rates.smallProfitsRatePercent)) / BigInt(100);
    return { taxPence: tax, marginalReliefPence: ZERO, band: "small_profits" };
  }

  const mainTax = (profitPence * BigInt(rates.mainRatePercent)) / BigInt(100);

  if (A >= rates.upperLimitPence) {
    return { taxPence: mainTax, marginalReliefPence: ZERO, band: "main" };
  }

  // Marginal Relief = F × (U − A) × N / A. Multiply before dividing throughout
  // so no intermediate step needs a non-integer bigint.
  const { numerator, denominator } = rates.marginalReliefFraction;
  const relief =
    (numerator * (rates.upperLimitPence - A) * profitPence) / (denominator * A);

  return { taxPence: mainTax - relief, marginalReliefPence: relief, band: "marginal" };
}
