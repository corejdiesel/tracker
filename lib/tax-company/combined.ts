import { calculateCorporationTax } from "./corporation-tax";
import { calculateDividendTax } from "./dividend-tax";
import type { CorporationTaxYear, DividendTaxYear } from "./rates";

const ZERO = BigInt(0);

export interface CompanyTaxPicture {
  corporationTaxPence: bigint;
  /** Post-CT profit that could be drawn as dividends, before any is. */
  distributableProfitPence: bigint;
  dividendTaxPence: bigint;
  /** What actually left the business or the director's pocket in tax. */
  totalTaxPence: bigint;
}

/**
 * The whole company + personal picture for a single director-shareholder
 * drawing a stated salary and dividend from a single company: Corporation
 * Tax on profit after salary, then dividend tax on what's drawn from what's
 * left.
 *
 * Deliberately NOT modelled: employer/employee National Insurance on the
 * salary, the salary's own income tax (assumed to already be handled via
 * PAYE — this function starts from "salary net cost to the company" and
 * "salary as the director's other income" as given, not derived), Scottish
 * income tax, associated companies, and any optimisation of the salary/
 * dividend split — this reports the tax bill for a split you choose, it does
 * not choose one for you. Each of those is real scope, flagged in the Notion
 * action list rather than guessed at here.
 *
 * `dividendPence` is capped at what's actually distributable — you cannot
 * draw more in dividends than the company has profit left to distribute
 * after Corporation Tax, and this function will not pretend otherwise.
 */
export function calculateCompanyTaxPicture(args: {
  profitBeforeTaxPence: bigint;
  dividendPence: bigint;
  otherPersonalIncomePence: bigint;
  ctYear: CorporationTaxYear;
  dividendYear: DividendTaxYear;
}): CompanyTaxPicture {
  const profit = args.profitBeforeTaxPence > ZERO ? args.profitBeforeTaxPence : ZERO;

  const ct = calculateCorporationTax(profit, args.ctYear);
  const distributable = profit - ct.taxPence;

  const dividendRequested = args.dividendPence > ZERO ? args.dividendPence : ZERO;
  const dividendActual = dividendRequested < distributable ? dividendRequested : distributable;

  const dividendTax = calculateDividendTax(
    dividendActual,
    args.otherPersonalIncomePence,
    args.dividendYear
  );

  return {
    corporationTaxPence: ct.taxPence,
    distributableProfitPence: distributable,
    dividendTaxPence: dividendTax.taxPence,
    totalTaxPence: ct.taxPence + dividendTax.taxPence,
  };
}
