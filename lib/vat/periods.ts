/**
 * VAT return periods.
 *
 * SIMPLIFICATION: calendar quarters (Jan–Mar, Apr–Jun, Jul–Sep, Oct–Dec).
 * A real VAT registration is assigned a "stagger group" by HMRC, and many
 * traders file on non-calendar quarters (e.g. Feb/May/Aug/Nov) or
 * monthly/annually. Until this app reads a trader's actual obligation
 * periods from the VAT (MTD) API — live submission is explicitly out of
 * scope per PLAN.md §4.5 — calendar quarters are the honest, predictable
 * default. The Tax page says so to the user, not just in this comment.
 *
 * All boundaries are date-only 'YYYY-MM-DD' strings, compared and built the
 * same lexicographic-ISO way as lib/dates.ts, for the same reason: it's
 * timezone-independent and matches chronological order exactly.
 */

export interface VatPeriod {
  /** 1–4 within the calendar year. */
  quarter: 1 | 2 | 3 | 4;
  /** Calendar year the quarter belongs to. */
  year: number;
  /** Inclusive start date. */
  startsOn: string;
  /** Inclusive end date. */
  endsOn: string;
  /** Human label, e.g. "Jul–Sep 2026". */
  label: string;
  /** Filing deadline: 1 calendar month + 7 days after the period end. */
  dueOn: string;
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Last calendar day of a (1-indexed) month, honouring leap years. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * VAT filing deadline: "one calendar month and 7 days" after the period
 * end. Source: https://www.gov.uk/vat-returns/deadlines (fetched 29 Aug
 * 2026): "The deadline for submitting your return online is usually one
 * calendar month and 7 days after the end of an accounting period. This is
 * also the deadline for paying HMRC." E.g. quarter ending 30 Sep → 7 Nov
 * (confirmed against gov.uk's own worked examples and independently via
 * web search, not just this formula, since it's easy to get this specific
 * case wrong — see the note below).
 */
export function vatDueDate(periodEnd: string): string {
  const [y, m, d] = periodEnd.split("-").map((p) => parseInt(p, 10)) as [number, number, number];
  let year = y;
  let month = m + 1; // 1-indexed; may overflow to 13
  if (month > 12) {
    month = 1;
    year += 1;
  }
  // "One calendar month" after a MONTH-END date means the next month's own
  // last day, not the same day-of-month clamped: 30 Sep + 1 month is 31 Oct,
  // not 30 Oct, even though 30 Oct is a valid October date and a naive
  // min(day, targetMonthLength) clamp would silently accept it. That naive
  // version passed on 31 Jan -> 28 Feb (Jan's day-31 genuinely doesn't fit
  // in Feb, forcing the clamp) but produced 30 Oct here, one day short of
  // the correct 31 Oct/7 Nov gov.uk and every other source gives for a
  // quarter ending 30 Sep — the day-31-into-Feb case masked this until a
  // second short-into-long-month case (Sep 30 -> Oct) caught it.
  const isSourceMonthEnd = d === lastDayOfMonth(y, m);
  const targetDay = isSourceMonthEnd ? lastDayOfMonth(year, month) : Math.min(d, lastDayOfMonth(year, month));
  const base = new Date(Date.UTC(year, month - 1, targetDay));
  base.setUTCDate(base.getUTCDate() + 7);
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(base.getUTCDate())}`;
}

/** Build the period for a given calendar year + quarter. */
export function vatPeriod(year: number, quarter: 1 | 2 | 3 | 4): VatPeriod {
  const startMonth = (quarter - 1) * 3 + 1; // 1, 4, 7, 10
  const endMonth = startMonth + 2; // 3, 6, 9, 12
  const startsOn = `${year}-${pad(startMonth)}-01`;
  const endsOn = `${year}-${pad(endMonth)}-${pad(lastDayOfMonth(year, endMonth))}`;
  const label = `${MONTH_ABBR[startMonth - 1]}–${MONTH_ABBR[endMonth - 1]} ${year}`;
  return { quarter, year, startsOn, endsOn, label, dueOn: vatDueDate(endsOn) };
}

/** Which calendar quarter (1–4) an ISO date falls in. */
export function quarterForDate(iso: string): 1 | 2 | 3 | 4 {
  const month = parseInt(iso.slice(5, 7), 10);
  return (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4;
}

/** The VAT period containing `today`. */
export function currentVatPeriod(today: string): VatPeriod {
  const year = parseInt(today.slice(0, 4), 10);
  return vatPeriod(year, quarterForDate(today));
}

/**
 * The most recent `count` VAT periods up to and including the one
 * containing `today`, newest first — populates a period selector.
 * `registeredFrom` (if known) caps how far back it goes, since there's no
 * point offering periods before the trader was VAT-registered.
 */
export function recentVatPeriods(
  count: number,
  today: string,
  registeredFrom?: string | null
): VatPeriod[] {
  const periods: VatPeriod[] = [];
  let { year, quarter } = currentVatPeriod(today);
  for (let i = 0; i < count; i++) {
    const p = vatPeriod(year, quarter);
    if (registeredFrom && p.endsOn < registeredFrom) break;
    periods.push(p);
    if (quarter === 1) {
      quarter = 4;
      year -= 1;
    } else {
      quarter = (quarter - 1) as 1 | 2 | 3 | 4;
    }
  }
  return periods;
}
