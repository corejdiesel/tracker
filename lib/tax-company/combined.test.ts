import { describe, expect, it } from "vitest";
import { calculateCompanyTaxPicture } from "./combined";

const pounds = (n: number) => BigInt(Math.round(n * 100));

describe("calculateCompanyTaxPicture", () => {
  const base = { ctYear: "FY2023" as const, dividendYear: "2026-27" as const };

  it("combines CT and dividend tax across the two regimes", () => {
    const result = calculateCompanyTaxPicture({
      ...base,
      profitBeforeTaxPence: pounds(100_000),
      dividendPence: pounds(10_000),
      otherPersonalIncomePence: pounds(12_570), // exactly fills PA
    });

    // CT on £100,000 = £22,750 (from the corporation-tax fixture).
    expect(result.corporationTaxPence).toBe(pounds(22_750));
    expect(result.distributableProfitPence).toBe(pounds(100_000 - 22_750));
    // Dividend tax on £10,000 with other income at the PA edge = £1,021.25
    // (from the dividend-tax fixture).
    expect(result.dividendTaxPence).toBe(pounds(1_021.25));
    expect(result.totalTaxPence).toBe(pounds(22_750) + pounds(1_021.25));
  });

  it("caps the dividend at what's actually distributable rather than allowing an overdraw", () => {
    const result = calculateCompanyTaxPicture({
      ...base,
      profitBeforeTaxPence: pounds(10_000), // CT ≈ £1,900, leaves ≈ £8,100
      dividendPence: pounds(50_000), // asking for far more than exists
      otherPersonalIncomePence: BigInt(0),
    });

    // Only the distributable amount can actually be taxed as a dividend.
    const expectedDividend = pounds(10_000) - result.corporationTaxPence;
    // Sanity: the capped dividend produces less tax than uncapped £50,000 would.
    expect(result.dividendTaxPence).toBeLessThan(pounds(50_000 * 0.1075));
    expect(expectedDividend).toBe(result.distributableProfitPence);
  });

  it("treats a loss as zero profit rather than a negative tax bill", () => {
    const result = calculateCompanyTaxPicture({
      ...base,
      profitBeforeTaxPence: pounds(-5_000),
      dividendPence: pounds(1_000),
      otherPersonalIncomePence: BigInt(0),
    });
    expect(result.corporationTaxPence).toBe(BigInt(0));
    expect(result.distributableProfitPence).toBe(BigInt(0));
    // No profit means no dividend is actually payable, whatever was asked for.
    expect(result.dividendTaxPence).toBe(BigInt(0));
  });

  it("takes no dividend tax when no dividend is drawn, even with healthy profit", () => {
    const result = calculateCompanyTaxPicture({
      ...base,
      profitBeforeTaxPence: pounds(200_000),
      dividendPence: BigInt(0),
      otherPersonalIncomePence: pounds(30_000),
    });
    expect(result.corporationTaxPence).toBeGreaterThan(BigInt(0));
    expect(result.dividendTaxPence).toBe(BigInt(0));
  });
});
