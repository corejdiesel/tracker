import { describe, expect, it } from "vitest";
import { checkRegistrationThreshold } from "./threshold";

const pounds = (n: number) => BigInt(n) * BigInt(100);

describe("checkRegistrationThreshold", () => {
  it("is clear well below the threshold", () => {
    const result = checkRegistrationThreshold(pounds(40_000), "2026-08-29");
    expect(result.status).toBe("clear");
    expect(result.thresholdPence).toBe(pounds(90_000));
    expect(result.headroomPence).toBe(pounds(50_000));
    expect(result.mustRegisterBy).toBeUndefined();
  });

  it("flags approaching at 90% of the threshold", () => {
    const result = checkRegistrationThreshold(pounds(81_000), "2026-08-29");
    expect(result.status).toBe("approaching");
  });

  it("is still clear just under the approaching band", () => {
    const result = checkRegistrationThreshold(pounds(80_999), "2026-08-29");
    expect(result.status).toBe("clear");
  });

  it("is not yet exceeded exactly at the threshold — only strictly over it", () => {
    // gov.uk: "more than £90,000" — so exactly £90,000 hasn't crossed it.
    const result = checkRegistrationThreshold(pounds(90_000), "2026-08-29");
    expect(result.status).toBe("approaching");
    expect(result.headroomPence).toBe(BigInt(0));
  });

  it("flags exceeded the moment turnover passes the threshold", () => {
    const result = checkRegistrationThreshold(pounds(90_001), "2026-08-29");
    expect(result.status).toBe("exceeded");
    expect(result.headroomPence).toBe(BigInt(-100));
  });

  it("computes the registration deadline as 30 days after the end of asOf's month", () => {
    // asOf 29 Aug -> month end 31 Aug -> +30 days.
    const result = checkRegistrationThreshold(pounds(95_000), "2026-08-29");
    expect(result.mustRegisterBy).toBe("2026-09-30");
  });

  it("computes the effective registration date as the 1st of the SECOND month after", () => {
    const result = checkRegistrationThreshold(pounds(95_000), "2026-08-29");
    expect(result.effectiveRegistrationDate).toBe("2026-10-01");
  });

  it("rolls the effective registration date over a year boundary from November", () => {
    const result = checkRegistrationThreshold(pounds(95_000), "2026-11-15");
    expect(result.effectiveRegistrationDate).toBe("2027-01-01");
  });

  it("rolls the effective registration date over a year boundary from December", () => {
    const result = checkRegistrationThreshold(pounds(95_000), "2026-12-01");
    expect(result.effectiveRegistrationDate).toBe("2027-02-01");
  });

  it("rolls the must-register-by deadline over a year boundary too", () => {
    // asOf in Dec -> month end 31 Dec -> +30 days crosses into next year.
    const result = checkRegistrationThreshold(pounds(95_000), "2026-12-01");
    expect(result.mustRegisterBy).toBe("2027-01-30");
  });
});
