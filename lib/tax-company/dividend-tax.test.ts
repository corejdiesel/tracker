import { describe, expect, it } from "vitest";
import { calculateDividendTax } from "./dividend-tax";

const pounds = (n: number) => BigInt(Math.round(n * 100));

describe("calculateDividendTax — 2026-27 rates", () => {
  it("charges nothing on zero or negative dividends", () => {
    expect(calculateDividendTax(BigInt(0), pounds(20_000), "2026-27").taxPence).toBe(BigInt(0));
    expect(calculateDividendTax(BigInt(-100), pounds(20_000), "2026-27").taxPence).toBe(BigInt(0));
  });

  it("is entirely covered by the £500 allowance when the dividend is smaller than it", () => {
    const result = calculateDividendTax(pounds(300), pounds(20_000), "2026-27");
    expect(result.taxPence).toBe(BigInt(0));
    expect(result.allowanceUsedPence).toBe(pounds(300));
  });

  it("taxes everything above the allowance at the basic rate, other income exactly at the PA edge", () => {
    // Other income exactly fills the personal allowance, so there's no PA
    // headroom left for the dividend — only the £500 allowance shelters it.
    const result = calculateDividendTax(pounds(10_000), pounds(12_570), "2026-27");
    expect(result.allowanceUsedPence).toBe(pounds(500));
    // (£10,000 − £500) × 10.75% = £1,021.25
    expect(result.taxPence).toBe(pounds(1_021.25));
  });

  it("spills into the additional rate once other income is already past the higher-rate edge", () => {
    const result = calculateDividendTax(pounds(10_000), pounds(200_000), "2026-27");
    // (£10,000 − £500) × 39.35% = £3,738.25
    expect(result.taxPence).toBe(pounds(3_738.25));
  });

  it("uses leftover personal allowance BEFORE the £500 dividend allowance — the ordering bug", () => {
    // Other income sits £70 below the personal allowance edge (£12,570).
    // That £70 of headroom must shelter the first £70 of dividend at 0% AS
    // PERSONAL ALLOWANCE, before the £500 dividend allowance even starts.
    // Getting this backwards (allowance first) taxes £70 that should be
    // free and shields £70 that should be taxed — the two errors partly
    // cancel, so a shallow test can pass with either ordering. This fixture
    // was hand-derived independently of the implementation specifically to
    // catch it: total tax should be (£1,000 − £70 PA − £500 allowance) ×
    // 10.75% = £430 × 10.75% = £46.225, truncated to the penny below.
    const result = calculateDividendTax(pounds(1_000), pounds(12_500), "2026-27");
    expect(result.allowanceUsedPence).toBe(pounds(500));
    expect(result.taxPence).toBe(BigInt(4_622)); // £46.22, truncated from £46.225
  });

  it("shelters the whole dividend at 0% when PA headroom alone covers it", () => {
    // Other income £5,000; PA headroom is £7,570 — comfortably covers a
    // £2,000 dividend before the £500 allowance is even reached.
    const result = calculateDividendTax(pounds(2_000), pounds(5_000), "2026-27");
    expect(result.taxPence).toBe(BigInt(0));
  });

  it("applies the £500 allowance as one flat block even when it straddles a band edge", () => {
    // Other income positioned so the dividend allowance's £500 slice would
    // straddle the basic/higher edge if it were split by band. HMRC doesn't
    // split it — the whole £500 is 0%, and only what's left is taxed at
    // whatever rate applies at THAT point in the stack.
    const bands = { basicUpper: 50_270 };
    const other = bands.basicUpper - 200; // £200 of basic-rate room left
    const result = calculateDividendTax(pounds(1_000), pounds(other), "2026-27");
    // £200 of the allowance sits in the basic band, £300 in the higher band
    // — still all 0%. Remaining £500 is taxed at the higher rate (35.75%),
    // since position is now past the basic edge.
    expect(result.allowanceUsedPence).toBe(pounds(500));
    expect(result.taxPence).toBe(pounds(500 * 0.3575));
  });
});
