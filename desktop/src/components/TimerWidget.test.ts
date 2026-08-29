import { describe, expect, it } from "vitest";
import { formatElapsed } from "./TimerWidget";

describe("formatElapsed", () => {
  it("shows m:ss under an hour", () => {
    const start = "2026-08-29T10:00:00.000Z";
    const now = new Date("2026-08-29T10:05:30.000Z").getTime();
    expect(formatElapsed(start, now)).toBe("5:30");
  });

  it("pads seconds under 10", () => {
    const start = "2026-08-29T10:00:00.000Z";
    const now = new Date("2026-08-29T10:05:05.000Z").getTime();
    expect(formatElapsed(start, now)).toBe("5:05");
  });

  it("switches to h:mm:ss past an hour", () => {
    const start = "2026-08-29T10:00:00.000Z";
    const now = new Date("2026-08-29T11:02:03.000Z").getTime();
    expect(formatElapsed(start, now)).toBe("1:02:03");
  });

  it("never goes negative if now is somehow before start (clock skew)", () => {
    const start = "2026-08-29T10:00:00.000Z";
    const now = new Date("2026-08-29T09:59:00.000Z").getTime();
    expect(formatElapsed(start, now)).toBe("0:00");
  });

  it("shows 0:00 at the instant it starts", () => {
    const start = "2026-08-29T10:00:00.000Z";
    const now = new Date("2026-08-29T10:00:00.000Z").getTime();
    expect(formatElapsed(start, now)).toBe("0:00");
  });
});
