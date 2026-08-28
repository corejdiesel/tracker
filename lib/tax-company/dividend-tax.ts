import { DIVIDEND_TAX_RATES, INCOME_TAX_BAND_EDGES, type DividendTaxYear } from "./rates";

const ZERO = BigInt(0);

export interface DividendTaxResult {
  taxPence: bigint;
  /** How much of the dividend the £500 allowance specifically covered — not
   * including any leftover personal allowance that also sheltered it. */
  allowanceUsedPence: bigint;
}

/**
 * Tax on dividend income, stacked on top of other taxable income for band
 * purposes — dividends are treated as the TOP slice of income, so a salary
 * that already fills the basic-rate band pushes dividends straight into the
 * higher rate. This is how HMRC's own dividend calculator works, and it's
 * why this function needs `otherIncomePence`, not just the dividend amount.
 *
 * Two separate 0% bands apply, in this order, because they are genuinely
 * different things:
 *   1. Any PERSONAL ALLOWANCE left unused by `otherIncomePence` shelters the
 *      bottom slice of the dividend, as personal allowance.
 *   2. The £500 DIVIDEND allowance is a flat 0% slice on whatever remains
 *      after that — HMRC does not split or reduce it if it happens to
 *      straddle a rate-band edge, so it is applied as one block, not walked
 *      through `take()` like the paid bands below it.
 * Getting the order backwards (allowance before checking PA headroom) looks
 * harmless but is wrong whenever other income is close to, but under, the
 * personal allowance — it then shelters the wrong pounds at 0% and taxes
 * pounds that should have been free. Caught by hand-deriving a fixture where
 * other income sits £70 below the personal allowance edge; see the test.
 *
 * England/Wales/NI band edges only — see the caveat on `rates.ts`.
 */
export function calculateDividendTax(
  dividendPence: bigint,
  otherIncomePence: bigint,
  year: DividendTaxYear
): DividendTaxResult {
  if (dividendPence <= ZERO) return { taxPence: ZERO, allowanceUsedPence: ZERO };

  const rates = DIVIDEND_TAX_RATES[year];
  const bands = INCOME_TAX_BAND_EDGES[year];

  let tax = ZERO;
  let remaining = dividendPence;
  let position = otherIncomePence > ZERO ? otherIncomePence : ZERO;

  const take = (bandEdge: bigint, ratePercent: number) => {
    if (remaining <= ZERO || position >= bandEdge) return;
    const available = bandEdge - position;
    const amount = remaining < available ? remaining : available;
    tax += (amount * BigInt(Math.round(ratePercent * 100))) / BigInt(10_000);
    position += amount;
    remaining -= amount;
  };

  // 1. Leftover personal allowance, if any, at 0%.
  take(bands.personalAllowancePence, 0);

  // 2. The £500 dividend allowance: a flat 0% slice, not band-aware.
  const allowanceUsedPence = remaining < rates.allowancePence ? remaining : rates.allowancePence;
  position += allowanceUsedPence;
  remaining -= allowanceUsedPence;

  // 3. Ordinary dividend rates on whatever is left.
  take(bands.basicRateUpperPence, rates.basicRatePercent);
  take(bands.higherRateUpperPence, rates.higherRatePercent);

  // Whatever is left past the higher-rate edge spills into the additional
  // rate with no upper bound.
  if (remaining > ZERO) {
    tax += (remaining * BigInt(Math.round(rates.additionalRatePercent * 100))) / BigInt(10_000);
  }

  return { taxPence: tax, allowanceUsedPence };
}
