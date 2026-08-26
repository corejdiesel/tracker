/**
 * All monetary values are pence, held as `bigint`. Never floats, never
 * `number` for a stored amount — this matches the getsorted.tax engine so
 * figures cross the boundary between the two without conversion.
 *
 * `number` appears only at the edges: what Postgres hands back for a `bigint`
 * column via PostgREST (a JS number, safe below 2^53 — about £90 trillion),
 * and what `Intl.NumberFormat` accepts for display.
 */

const ZERO = BigInt(0);

/** Widen whatever PostgREST returned for a bigint column into a bigint. */
export function toPence(value: number | string | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return ZERO;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(Math.round(value));
  const trimmed = value.trim();
  return trimmed === "" ? ZERO : BigInt(trimmed);
}

/**
 * Parse a user-typed pounds string into pence. Returns `null` for anything
 * that isn't a finite, non-negative amount, so callers reject bad input rather
 * than silently storing NaN. Tolerates "£", thousands separators, whitespace.
 *
 * Deliberately string-based: `Number("0.07") * 100` is 7.000000000000001, and
 * rounding that is fine, but doing the arithmetic in decimal avoids the class
 * of bug entirely.
 */
export function parsePounds(raw: string): bigint | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().replace(/[£,\s]/g, "");
  if (cleaned === "") return null;
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const pounds = BigInt(match[1]!);
  const pence = BigInt((match[2] ?? "").padEnd(2, "0"));
  return pounds * BigInt(100) + pence;
}

/** Apply a whole-percent share, rounding down. Used for business-use splits. */
export function percentOf(pence: bigint, percent: number): bigint {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (pence * BigInt(clamped)) / BigInt(100);
}

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
});

const GBP_WHOLE = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** "£4,200.00" — the default. Never renders a bare number. */
export function formatMoney(pence: bigint): string {
  return GBP.format(Number(pence) / 100);
}

/** "£4,200" — for headline figures where pence are noise. Rounds to nearest. */
export function formatMoneyWhole(pence: bigint): string {
  return GBP_WHOLE.format(Number(pence) / 100);
}

/** "+£4,200.00" / "−£120.00" — for deltas, using a real minus sign. */
export function formatMoneySigned(pence: bigint): string {
  if (pence === ZERO) return formatMoney(ZERO);
  const magnitude = formatMoney(pence < ZERO ? -pence : pence);
  return pence < ZERO ? `−${magnitude}` : `+${magnitude}`;
}

export function sumPence(values: readonly bigint[]): bigint {
  return values.reduce<bigint>((total, value) => total + value, ZERO);
}
