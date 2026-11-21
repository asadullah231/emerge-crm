import { describe, expect, it } from "vitest";
import { bucketStart, lastBuckets, presetRange } from "../routers/dashboard-cards";

describe("dashboard card date helpers", () => {
  const now = new Date(2026, 10, 21, 15, 30); // Sat 21 Nov 2026

  it("resolves calendar presets to [from, to) windows", () => {
    expect(presetRange("this_month", now)).toEqual({ from: new Date(2026, 10, 1), to: undefined });
    expect(presetRange("last_month", now)).toEqual({
      from: new Date(2026, 9, 1),
      to: new Date(2026, 10, 1)
    });
    expect(presetRange("last_quarter", now)).toEqual({
      from: new Date(2026, 6, 1),
      to: new Date(2026, 9, 1)
    });
    expect(presetRange("last_year", now)).toEqual({
      from: new Date(2025, 0, 1),
      to: new Date(2026, 0, 1)
    });
    expect(presetRange("all", now)).toEqual({ from: undefined, to: undefined });
    expect(presetRange(undefined, now)).toEqual({ from: undefined, to: undefined });
  });

  it("starts weeks on Monday and months on the 1st", () => {
    expect(bucketStart(now, "week")).toEqual(new Date(2026, 10, 16));
    expect(bucketStart(now, "month")).toEqual(new Date(2026, 10, 1));
    expect(bucketStart(now, "year")).toEqual(new Date(2026, 0, 1));
  });

  it("returns the last n buckets oldest first, ending with the current one", () => {
    const months = lastBuckets("month", 12, now);
    expect(months).toHaveLength(12);
    expect(months[0]).toEqual(new Date(2025, 11, 1));
    expect(months[11]).toEqual(new Date(2026, 10, 1));
    const years = lastBuckets("year", 5, now);
    expect(years.map((d) => d.getFullYear())).toEqual([2022, 2023, 2024, 2025, 2026]);
    const weeks = lastBuckets("week", 3, now);
    expect(weeks.map((d) => d.getDate())).toEqual([2, 9, 16]);
  });
});
