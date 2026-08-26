import { describe, expect, it } from "vitest";
import {
  formatMoney,
  formatMoneySigned,
  formatMoneyWhole,
  parsePounds,
  percentOf,
  sumPence,
  toPence,
} from "./money";

describe("toPence", () => {
  it("passes bigints through", () => expect(toPence(BigInt(420000))).toBe(BigInt(420000)));
  it("widens the number PostgREST returns for a bigint column", () =>
    expect(toPence(420000)).toBe(BigInt(420000)));
  it("parses a string amount", () => expect(toPence("420000")).toBe(BigInt(420000)));
  it("treats null, undefined and empty string as zero", () => {
    expect(toPence(null)).toBe(BigInt(0));
    expect(toPence(undefined)).toBe(BigInt(0));
    expect(toPence("")).toBe(BigInt(0));
  });
  it("keeps negatives", () => expect(toPence(-1250)).toBe(BigInt(-1250)));
});

describe("parsePounds", () => {
  it("parses a plain amount", () => expect(parsePounds("4200")).toBe(BigInt(420000)));
  it("parses pence", () => expect(parsePounds("4200.50")).toBe(BigInt(420050)));
  it("pads a single decimal place", () => expect(parsePounds("10.5")).toBe(BigInt(1050)));
  it("tolerates £, commas and whitespace", () =>
    expect(parsePounds("  £4,200.00 ")).toBe(BigInt(420000)));
  it("accepts zero", () => expect(parsePounds("0")).toBe(BigInt(0)));
  it("does not lose the last penny to float error", () => {
    expect(parsePounds("0.07")).toBe(BigInt(7));
    expect(parsePounds("1.10")).toBe(BigInt(110));
    expect(parsePounds("8.29")).toBe(BigInt(829));
  });
  it("rejects negatives, exponents, three decimals and junk", () => {
    for (const bad of ["-5", "1e3", "4200.005", "abc", "", "  ", "£"]) {
      expect(parsePounds(bad)).toBeNull();
    }
  });
});

describe("percentOf", () => {
  it("returns the whole amount at 100%", () =>
    expect(percentOf(BigInt(10000), 100)).toBe(BigInt(10000)));
  it("halves at 50%", () => expect(percentOf(BigInt(10000), 50)).toBe(BigInt(5000)));
  it("rounds down rather than inventing a penny", () =>
    expect(percentOf(BigInt(999), 50)).toBe(BigInt(499)));
  it("clamps out-of-range percentages", () => {
    expect(percentOf(BigInt(10000), 150)).toBe(BigInt(10000));
    expect(percentOf(BigInt(10000), -10)).toBe(BigInt(0));
  });
});

describe("formatting", () => {
  it("always shows two decimal places", () => {
    expect(formatMoney(BigInt(420000))).toBe("£4,200.00");
    expect(formatMoney(BigInt(0))).toBe("£0.00");
    expect(formatMoney(BigInt(7))).toBe("£0.07");
  });
  it("formats headline figures without pence", () =>
    expect(formatMoneyWhole(BigInt(420050))).toBe("£4,201"));
  it("signs deltas with a real minus sign", () => {
    expect(formatMoneySigned(BigInt(420000))).toBe("+£4,200.00");
    expect(formatMoneySigned(BigInt(-12000))).toBe("−£120.00");
    expect(formatMoneySigned(BigInt(0))).toBe("£0.00");
  });
  it("survives amounts past the float-safe integer range", () =>
    expect(formatMoney(BigInt("900719925474099"))).toBe("£9,007,199,254,740.99"));
});

describe("sumPence", () => {
  it("sums an empty list to zero", () => expect(sumPence([])).toBe(BigInt(0)));
  it("sums exactly, with no float drift", () => {
    const pennies = Array.from({ length: 1000 }, () => BigInt(7));
    expect(sumPence(pennies)).toBe(BigInt(7000));
  });
});
