import { describe, expect, it } from "vitest";
import { calculateCorporationTax } from "./corporation-tax";

const pounds = (n: number) => BigInt(n) * BigInt(100);

describe("calculateCorporationTax — FY2023 rates", () => {
  it("charges nothing on zero or negative profit", () => {
    expect(calculateCorporationTax(BigInt(0), "FY2023").taxPence).toBe(BigInt(0));
    expect(calculateCorporationTax(BigInt(-500), "FY2023").taxPence).toBe(BigInt(0));
  });

  it("charges the small profits rate flat below the lower limit", () => {
    const result = calculateCorporationTax(pounds(30_000), "FY2023");
    expect(result.band).toBe("small_profits");
    expect(result.taxPence).toBe(pounds(30_000 * 0.19));
    expect(result.marginalReliefPence).toBe(BigInt(0));
  });

  it("is still small-profits-rate exactly AT the lower limit — no relief needed", () => {
    const result = calculateCorporationTax(pounds(50_000), "FY2023");
    expect(result.band).toBe("small_profits");
    expect(result.taxPence).toBe(pounds(9_500)); // 19% of £50,000
  });

  it("charges the main rate flat exactly AT and above the upper limit", () => {
    const atLimit = calculateCorporationTax(pounds(250_000), "FY2023");
    expect(atLimit.band).toBe("main");
    expect(atLimit.taxPence).toBe(pounds(62_500)); // 25% of £250,000
    expect(atLimit.marginalReliefPence).toBe(BigInt(0));

    const above = calculateCorporationTax(pounds(300_000), "FY2023");
    expect(above.band).toBe("main");
    expect(above.taxPence).toBe(pounds(75_000));
  });

  it("computes Marginal Relief exactly, at the midpoint of the band", () => {
    // MR = F × (U − A) × N/A = 3/200 × (250,000 − 100,000) × 1 = £2,250.
    const result = calculateCorporationTax(pounds(100_000), "FY2023");
    expect(result.band).toBe("marginal");
    expect(result.marginalReliefPence).toBe(pounds(2_250));
    expect(result.taxPence).toBe(pounds(25_000 - 2_250)); // 25% flat minus relief
  });

  it("holds the widely-quoted 26.5% marginal rate across the whole band, not just at one point", () => {
    // d(tax)/dN = mainRate + F = 25% + 1.5% = 26.5% for every extra pound
    // between the limits. Checked at two different points in the band so a
    // formula that only happens to work at one number can't pass by luck.
    const at100k = calculateCorporationTax(pounds(100_000), "FY2023").taxPence;
    const at150k = calculateCorporationTax(pounds(150_000), "FY2023").taxPence;
    const at200k = calculateCorporationTax(pounds(200_000), "FY2023").taxPence;

    expect(at150k - at100k).toBe(pounds(50_000 * 0.265));
    expect(at200k - at150k).toBe(pounds(50_000 * 0.265));
  });

  it("treats augmented profits, not taxable profits, as what decides the band", () => {
    // A company with £40,000 taxable profit but £60,000 augmented profits
    // (because of dividends received from a non-group company) has left the
    // small-profits band even though its OWN profit hasn't crossed £50,000.
    const result = calculateCorporationTax(pounds(40_000), "FY2023", pounds(60_000));
    expect(result.band).toBe("marginal");
  });
});
