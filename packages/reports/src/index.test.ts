import { describe, expect, it } from "vitest";
import { computeNextRun, reportToCsv, type ReportTable } from "./index";

describe("computeNextRun", () => {
  it("daily: same day when the hour is still ahead, else next day", () => {
    const before = computeNextRun("daily", { hourUtc: 7 }, new Date("2026-08-16T05:00:00Z"));
    expect(before.toISOString()).toBe("2026-08-16T07:00:00.000Z");
    const after = computeNextRun("daily", { hourUtc: 7 }, new Date("2026-08-16T09:00:00Z"));
    expect(after.toISOString()).toBe("2026-08-17T07:00:00.000Z");
  });

  it("weekly: lands on the target weekday at the target hour, strictly ahead", () => {
    const from = new Date("2026-08-16T09:00:00Z");
    const next = computeNextRun("weekly", { hourUtc: 7, dayOfWeek: 3 }, from);
    expect(next.getUTCDay()).toBe(3);
    expect(next.getUTCHours()).toBe(7);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });

  it("monthly: clamps to the chosen day and rolls to next month when past", () => {
    const from = new Date("2026-08-16T09:00:00Z");
    const next = computeNextRun("monthly", { hourUtc: 7, dayOfMonth: 1 }, from);
    expect(next.getUTCDate()).toBe(1);
    expect(next.getUTCMonth()).toBe(8); // September (0-indexed)
    expect(next.toISOString()).toBe("2026-09-01T07:00:00.000Z");
  });
});

describe("reportToCsv", () => {
  it("emits a header row and escapes commas, quotes and newlines", () => {
    const table: ReportTable = {
      key: "leaderboard",
      title: "Test",
      columns: ["User", "Note"],
      rows: [
        ["Sam", "plain"],
        ["Ada, Jr", 'has "quote"'],
        ["Line", "a\nb"]
      ]
    };
    const csv = reportToCsv(table);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("User,Note");
    expect(lines[1]).toBe("Sam,plain");
    expect(lines[2]).toBe('"Ada, Jr","has ""quote"""');
    expect(lines[3]).toBe('Line,"a\nb"');
  });
});
