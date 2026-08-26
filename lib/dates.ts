/**
 * UK tax year runs 6 April to 5 April.
 *
 * Timezone determinism, carried over from getsorted.tax because it is a bug
 * someone has already paid for: a stored date is a DATE ('YYYY-MM-DD') with no
 * time or zone, but `new Date()` reads local time. Comparing the two risks an
 * off-by-one at the 6 April boundary for anyone not on UTC. So classification
 * of a date-only value is done by lexicographic STRING comparison of ISO
 * dates, which is timezone-independent and exactly matches chronological order.
 *
 * Prefer these helpers over constructing a `Date` to decide which period a
 * stored date falls in.
 */

/** A tax year label, e.g. "2026-27". */
export type TaxYear = string;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

/** Today as 'YYYY-MM-DD' in the viewer's own calendar — what "today" means to them. */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** First calendar year of the tax year containing an ISO date. */
function taxYearStartYear(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  // The tax year starts 6 April. On or after that date, this calendar year.
  return m > 4 || (m === 4 && d >= 6) ? y : y - 1;
}

/** '2026-04-06' → '2026-27';  '2026-04-05' → '2025-26'. */
export function taxYearForDate(iso: string): TaxYear {
  const start = taxYearStartYear(iso);
  return `${start}-${String(start + 1).slice(-2)}`;
}

export function currentTaxYear(now: Date = new Date()): TaxYear {
  return taxYearForDate(todayIso(now));
}

/** Inclusive ISO bounds of a tax year: 6 April → 5 April. */
export function taxYearRange(taxYear: TaxYear): { start: string; end: string } {
  const startYear = Number(taxYear.split("-")[0]);
  return { start: `${startYear}-04-06`, end: `${startYear + 1}-04-05` };
}

/** Add days to an ISO date, staying in UTC so DST never shifts the result. */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const at = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((at(to) - at(from)) / 86_400_000);
}

/**
 * Days a payment is overdue, or 0 if it is not. Takes `today` explicitly so
 * server and client agree and so it is testable without mocking the clock.
 */
export function daysOverdue(dueDate: string, today: string): number {
  const overdue = daysBetween(dueDate, today);
  return overdue > 0 ? overdue : 0;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** '2026-08-26' → '26 Aug 2026'. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** '2026-08-26' → '26 Aug' — for dense tables where the year is implied. */
export function formatDateShort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS[m - 1]}`;
}

/** Human relative phrasing for a deadline: "in 3 days", "today", "6 days ago". */
export function relativeDays(iso: string, today: string): string {
  const delta = daysBetween(today, iso);
  if (delta === 0) return "today";
  if (delta === 1) return "tomorrow";
  if (delta === -1) return "yesterday";
  return delta > 0 ? `in ${delta} days` : `${-delta} days ago`;
}
