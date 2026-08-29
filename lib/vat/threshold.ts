import type { VatRates } from "./rates";
import { VAT_RATES } from "./rates";

/**
 * VAT registration threshold monitoring — not part of the getsorted.tax
 * `lib/vat` module this file's siblings were ported from, since that app
 * assumes an already-registered trader. W Technologies Ltd isn't
 * registered, so this is the actually load-bearing piece for now: knowing
 * *when* registration becomes mandatory matters more than a return preview
 * does while nothing is due.
 *
 * Source: https://www.gov.uk/register-for-vat (fetched 29 Aug 2026):
 * registration is mandatory when EITHER (a) taxable turnover for the last
 * 12 months goes over the threshold, OR (b) turnover is expected to go
 * over it in the next 30 days alone. This module only checks (a) — a
 * rolling-12-month total this app can compute from real invoice data. (b)
 * depends on a forward-looking business judgement (an expected big
 * contract landing, say) this app has no data for; the VAT page states the
 * 30-day rule to the user rather than pretending to evaluate it.
 *
 * SIMPLIFICATION on the registration deadline: gov.uk's rule is 30 days
 * from the END OF THE MONTH turnover actually crossed the threshold, with
 * an effective registration date of the first day of the second month
 * after that. This app has a single rolling-12-month figure as of `asOf`,
 * not a day-by-day history, so it can't know the exact date the threshold
 * was crossed if it already has been — it treats `asOf`'s own month as the
 * crossing month, which is exact if this is the first time the check is
 * run at-or-after the real crossing, and conservative (a later, still-safe
 * deadline) otherwise. The VAT page says so; this is a estimate for
 * planning, not a filed position, same as everywhere else in this app.
 */

export type RegistrationThresholdStatus = "clear" | "approaching" | "exceeded";

/** Turnover at or above this fraction of the threshold is flagged
 * "approaching" — an early-warning heuristic this app chose, not an HMRC
 * rule (HMRC only recognises "over" or "will be over within 30 days"). */
const APPROACHING_FRACTION_PERCENT = 90;

export interface RegistrationThresholdCheck {
  rollingTurnoverPence: bigint;
  thresholdPence: bigint;
  /** threshold − turnover. Negative once the threshold is exceeded. */
  headroomPence: bigint;
  status: RegistrationThresholdStatus;
  /** Set only when status is "exceeded": 30 days after the end of the
   * month `asOf` falls in, per gov.uk's registration deadline. */
  mustRegisterBy?: string;
  /** Set only when status is "exceeded": the first day of the second month
   * after the month `asOf` falls in — the effective registration date
   * gov.uk assigns for a backward-looking (already-over) registration. */
  effectiveRegistrationDate?: string;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function addDaysUtc(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map((p) => parseInt(p, 10)) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function checkRegistrationThreshold(
  rollingTurnoverPence: bigint,
  asOf: string,
  rates: VatRates = VAT_RATES.current
): RegistrationThresholdCheck {
  const thresholdPence = rates.registrationThresholdPence;
  const headroomPence = thresholdPence - rollingTurnoverPence;

  // gov.uk: registration triggers when turnover is "more than" the
  // threshold — so turnover exactly AT the threshold has not crossed it
  // yet (headroomPence === 0 stays in the clear/approaching branch below).
  if (headroomPence >= BigInt(0)) {
    const approachingFloor =
      (thresholdPence * BigInt(APPROACHING_FRACTION_PERCENT)) / BigInt(100);
    return {
      rollingTurnoverPence,
      thresholdPence,
      headroomPence,
      status: rollingTurnoverPence >= approachingFloor ? "approaching" : "clear",
    };
  }

  const [y, m] = asOf.split("-").map((p) => parseInt(p, 10)) as [number, number];
  const monthEnd = `${y}-${pad(m)}-${pad(lastDayOfMonth(y, m))}`;
  const mustRegisterBy = addDaysUtc(monthEnd, 30);

  const effectiveYear = m >= 11 ? y + 1 : y;
  const effectiveMonth = m >= 11 ? m - 10 : m + 2; // start of the SECOND month after
  const effectiveRegistrationDate = `${effectiveYear}-${pad(effectiveMonth)}-01`;

  return {
    rollingTurnoverPence,
    thresholdPence,
    headroomPence,
    status: "exceeded",
    mustRegisterBy,
    effectiveRegistrationDate,
  };
}
