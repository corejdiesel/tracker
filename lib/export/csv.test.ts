import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

const columns = [
  { key: "name", header: "Name" },
  { key: "amount", header: "Amount" },
] as const;

describe("toCsv", () => {
  it("writes a header and rows in column order", () => {
    const csv = toCsv([{ name: "Adobe", amount: "59.99" }], columns);
    expect(csv).toBe("Name,Amount\r\nAdobe,59.99\r\n");
  });

  it("still writes a header when there are no rows", () => {
    expect(toCsv([], columns)).toBe("Name,Amount\r\n");
  });

  it("quotes a field containing a comma — the classic silent-corruption case", () => {
    const csv = toCsv([{ name: "Smith, Jones & Co", amount: "100" }], columns);
    expect(csv).toBe('Name,Amount\r\n"Smith, Jones & Co",100\r\n');
  });

  it("quotes and doubles an embedded quote", () => {
    const csv = toCsv([{ name: 'The "Big" Client', amount: "1" }], columns);
    expect(csv).toBe('Name,Amount\r\n"The ""Big"" Client",1\r\n');
  });

  it("quotes a field containing a newline", () => {
    const csv = toCsv([{ name: "Line one\nLine two", amount: "1" }], columns);
    expect(csv).toBe('Name,Amount\r\n"Line one\nLine two",1\r\n');
  });

  it("renders null and undefined as an empty field, not the literal string", () => {
    const csv = toCsv([{ name: null, amount: undefined }], columns);
    expect(csv).toBe("Name,Amount\r\n,\r\n");
  });

  it("does not quote a field that needs no quoting", () => {
    const csv = toCsv([{ name: "Plain", amount: "42" }], columns);
    expect(csv).toBe("Name,Amount\r\nPlain,42\r\n");
  });
});
