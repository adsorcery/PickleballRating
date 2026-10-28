import { describe, expect, it } from "vitest";
import { epochToLocalInput, localDayKey, localInputToEpoch } from "@/lib/time";

describe("time helpers", () => {
  it("derives the local calendar day in a timezone", () => {
    const t = Date.UTC(2026, 0, 15, 3, 30); // 19:30 on Jan 14 in Los Angeles
    expect(localDayKey(t, "America/Los_Angeles")).toBe("2026-01-14");
    expect(localDayKey(t, "UTC")).toBe("2026-01-15");
    expect(localDayKey(t, "Asia/Ho_Chi_Minh")).toBe("2026-01-15");
  });

  it("round-trips datetime-local values, including across DST", () => {
    for (const tz of ["America/Los_Angeles", "UTC", "Asia/Ho_Chi_Minh", "Europe/London"]) {
      for (const v of ["2026-01-14T19:30", "2026-07-04T08:05", "2026-03-08T12:00", "2026-11-01T00:30"]) {
        const ms = localInputToEpoch(v, tz)!;
        expect(epochToLocalInput(ms, tz)).toBe(v);
      }
    }
    expect(localInputToEpoch("2026-07-04T12:00", "America/Los_Angeles")).toBe(Date.UTC(2026, 6, 4, 19, 0));
    expect(localInputToEpoch("2026-01-04T12:00", "America/Los_Angeles")).toBe(Date.UTC(2026, 0, 4, 20, 0));
  });

  it("rejects malformed input", () => {
    expect(localInputToEpoch("2026-02-30T10:00", "UTC")).toBeNull();
    expect(localInputToEpoch("nope", "UTC")).toBeNull();
    expect(localInputToEpoch("2026-01-01T24:00", "UTC")).toBeNull();
  });
});
