/**
 * UK company and dividend tax rates, by financial/tax year.
 *
 * Sourced from gov.uk directly (not from memory, not from a third-party
 * aggregator) on 26 Aug 2026 — see the citation on each block. Every figure
 * that changes annually lives here and nowhere else; a new year is a new
 * entry in these tables, never an edit to the formula in
 * `corporation-tax.ts` or `dividend-tax.ts`.
 *
 * This is the fix for the gap the getsorted.tax audit found: that engine
 * hardcodes one year's income-tax thresholds as module constants with no
 * year parameter on any function, so it cannot express a second year at all.
 * Every calculation here takes a year and looks its rates up.
 */

/** Corporation Tax financial year — 1 April to 31 March, named by the START year. */
export type CorporationTaxYear = "FY2023";

export interface CorporationTaxRates {
  /** Profits at or below this pay the small profits rate in full. */
  lowerLimitPence: bigint;
  /** Profits at or above this pay the main rate in full. */
  upperLimitPence: bigint;
  smallProfitsRatePercent: number;
  mainRatePercent: number;
  /**
   * The "standard fraction" Parliament sets for Marginal Relief (Corporation
   * Tax Act 2010 s269CB). Expressed as an exact fraction, not a decimal —
   * 3/200 has no clean bigint-safe decimal form, and the fraction is what
   * HMRC's own guidance names it as.
   */
  marginalReliefFraction: { numerator: bigint; denominator: bigint };
}

/**
 * FY2023 (1 Apr 2023 –) rates: unchanged through the 2026 calendar year — no
 * change has been announced. Source:
 * https://www.gov.uk/guidance/corporation-tax-marginal-relief and
 * https://www.gov.uk/government/publications/rates-and-allowances-corporation-tax/rates-and-allowances-corporation-tax
 * (fetched 26 Aug 2026). Limits shown are for a company with NO associated
 * companies — see the doc comment on `calculateCorporationTax` for that
 * adjustment, which this table does not attempt.
 */
export const CORPORATION_TAX_RATES: Record<CorporationTaxYear, CorporationTaxRates> = {
  FY2023: {
    lowerLimitPence: BigInt(5_000_000),   // £50,000
    upperLimitPence: BigInt(25_000_000),  // £250,000
    smallProfitsRatePercent: 19,
    mainRatePercent: 25,
    marginalReliefFraction: { numerator: BigInt(3), denominator: BigInt(200) },
  },
};

/** A UK tax year label, e.g. "2026-27" — matches the format used in lib/dates.ts. */
export type DividendTaxYear = "2026-27";

export interface DividendTaxRates {
  allowancePence: bigint;
  basicRatePercent: number;
  higherRatePercent: number;
  additionalRatePercent: number;
}

/**
 * Source: https://www.gov.uk/tax-on-dividends (fetched 26 Aug 2026), which
 * states these rates apply "from 6 April 2026 to 5 April 2027". The basic and
 * higher rates rose from 8.75%/33.75% with effect from 6 April 2026; the
 * additional rate and the allowance were unchanged.
 *
 * Which band a dividend falls in depends on TOTAL taxable income (salary,
 * other income, then dividends stacked on top) — see `dividend-tax.ts`. UK
 * dividend tax rates and the allowance are set UK-wide, not devolved, but the
 * income-tax band EDGES a Scottish taxpayer's non-dividend income determines
 * differ from the rUK figures this table's companion `income-tax-bands.ts`
 * uses. Scottish-resident directors are not correctly modelled yet — flagged
 * in the Notion action list, not guessed at here.
 */
export const DIVIDEND_TAX_RATES: Record<DividendTaxYear, DividendTaxRates> = {
  "2026-27": {
    allowancePence: BigInt(500_00),
    basicRatePercent: 10.75,
    higherRatePercent: 35.75,
    additionalRatePercent: 39.35,
  },
};

/**
 * Income Tax band edges (England, Wales, Northern Ireland — NOT Scotland; see
 * the note above). These decide which dividend-tax band a pound of dividend
 * income falls into, once non-dividend income has used up the bands below it.
 * Source: https://www.gov.uk/income-tax-rates (fetched 26 Aug 2026) —
 * unchanged from 2025-26, both years' bands are frozen.
 */
export interface IncomeTaxBandEdges {
  personalAllowancePence: bigint;
  basicRateUpperPence: bigint;
  higherRateUpperPence: bigint;
}

export const INCOME_TAX_BAND_EDGES: Record<DividendTaxYear, IncomeTaxBandEdges> = {
  "2026-27": {
    personalAllowancePence: BigInt(1_257_000),
    basicRateUpperPence: BigInt(5_027_000),
    higherRateUpperPence: BigInt(12_514_000),
  },
};
