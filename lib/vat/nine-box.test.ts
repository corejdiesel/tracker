import { describe, expect, it } from "vitest";
import { computeStandardNineBox } from "./nine-box";

const pounds = (n: number) => BigInt(n) * BigInt(100);

describe("computeStandardNineBox", () => {
  it("computes a straightforward payable quarter", () => {
    // £50,000 net sales, 20% VAT charged = £10,000 output VAT.
    // £10,000 net purchases, 20% VAT paid = £2,000 input VAT.
    const result = computeStandardNineBox({
      outputVatPence: pounds(10_000),
      inputVatPence: pounds(2_000),
      netSalesPence: pounds(50_000),
      netPurchasesPence: pounds(10_000),
    });

    expect(result.box1).toBe(pounds(10_000));
    expect(result.box2).toBe(BigInt(0));
    expect(result.box3).toBe(pounds(10_000)); // box1 + box2
    expect(result.box4).toBe(pounds(2_000));
    expect(result.box5).toBe(pounds(8_000)); // box3 - box4
    expect(result.box5Direction).toBe("payable");
    expect(result.box6).toBe(pounds(50_000));
    expect(result.box7).toBe(pounds(10_000));
    expect(result.box8).toBe(BigInt(0));
    expect(result.box9).toBe(BigInt(0));
  });

  it("flips to reclaim when input VAT exceeds output VAT", () => {
    const result = computeStandardNineBox({
      outputVatPence: pounds(1_000),
      inputVatPence: pounds(4_000),
      netSalesPence: pounds(5_000),
      netPurchasesPence: pounds(20_000),
    });

    expect(result.box5Direction).toBe("reclaim");
    expect(result.box5).toBe(pounds(3_000)); // |1,000 - 4,000|, always non-negative
  });

  it("treats an exact tie as payable, not reclaim", () => {
    const result = computeStandardNineBox({
      outputVatPence: pounds(2_000),
      inputVatPence: pounds(2_000),
      netSalesPence: pounds(10_000),
      netPurchasesPence: pounds(10_000),
    });
    expect(result.box5).toBe(BigInt(0));
    expect(result.box5Direction).toBe("payable");
  });

  it("truncates boxes 6/7 to whole pounds, rounding down, never up", () => {
    const result = computeStandardNineBox({
      outputVatPence: BigInt(0),
      inputVatPence: BigInt(0),
      netSalesPence: BigInt(123_499), // £1,234.99
      netPurchasesPence: BigInt(9_999), // £99.99
    });
    expect(result.box6).toBe(BigInt(123_400)); // truncated to £1,234
    expect(result.box7).toBe(BigInt(9_900)); // truncated to £99
  });

  it("keeps boxes 1-5 to the exact penny with no rounding at all", () => {
    const result = computeStandardNineBox({
      outputVatPence: BigInt(1_001), // an odd penny amount
      inputVatPence: BigInt(1),
      netSalesPence: BigInt(0),
      netPurchasesPence: BigInt(0),
    });
    expect(result.box1).toBe(BigInt(1_001));
    expect(result.box4).toBe(BigInt(1));
    expect(result.box5).toBe(BigInt(1_000));
  });

  it("returns all zeros for an empty period", () => {
    const result = computeStandardNineBox({
      outputVatPence: BigInt(0), inputVatPence: BigInt(0),
      netSalesPence: BigInt(0), netPurchasesPence: BigInt(0),
    });
    expect(result.box3).toBe(BigInt(0));
    expect(result.box5).toBe(BigInt(0));
    expect(result.box5Direction).toBe("payable"); // 0 >= 0
  });
});
