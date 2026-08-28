/**
 * A minimal, correct CSV writer — not a library, because the RFC 4180 rules
 * this actually needs are small and worth having under direct test:
 * quote a field if it contains a comma, a quote, or a newline; a literal
 * quote inside a quoted field doubles itself. Getting this wrong corrupts
 * silently — a vendor name with a comma splits into the wrong column in
 * Excel with no error, which is exactly the failure mode "hand my
 * accountant a folder" cannot afford.
 */

function csvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Rows must all share the same shape — pass `columns` explicitly rather
 * than inferring from `Object.keys(rows[0])`, so an export with zero rows
 * still produces a header line (a blank CSV with only a header is a
 * correct, openable file; one with no header at all looks broken).
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly { key: keyof T & string; header: string }[]
): string {
  const headerLine = columns.map((c) => csvField(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => csvField(row[c.key])).join(","));
  // CRLF per RFC 4180 — Excel on Windows in particular is fussier about
  // this than a bare \n, and CRLF is valid everywhere \n is expected.
  return [headerLine, ...lines].join("\r\n") + "\r\n";
}
