/**
 * Report definitions + presentation helpers (M14) - PURE, no database access.
 * The Drizzle aggregate queries live in @emerge/db (`runReport`), which keeps
 * this package free of drizzle-orm so it type-checks cleanly wherever it is
 * bundled (web + worker). Shared here: the report catalog, the tabular result
 * shape, CSV rendering, and the schedule cadence math.
 */
import { z } from "zod";

export const REPORT_KEYS = [
  "funnel",
  "submissionsBySourcer",
  "timeInStage",
  "timeToFirstSubmission",
  "clientHealth",
  "leaderboard"
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_LABELS: Record<ReportKey, string> = {
  funnel: "Pipeline funnel + conversion",
  submissionsBySourcer: "Submissions per sourcer",
  timeInStage: "Average time in stage",
  timeToFirstSubmission: "Time to first submission",
  clientHealth: "Client health",
  leaderboard: "Recruiter leaderboard"
};

export const reportFilters = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
  /** Application owner / sourcer. */
  userId: z.string().uuid().optional(),
  /** Client company. */
  companyId: z.string().uuid().optional()
});
export type ReportFilters = z.infer<typeof reportFilters>;

export type ReportTable = {
  key: ReportKey;
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
};

/** RFC 4180 CSV of a report table (used by the scheduled email attachment). */
export function reportToCsv(t: ReportTable): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [t.columns.map(esc).join(","), ...t.rows.map((r) => r.map(esc).join(","))];
  return lines.join("\r\n");
}

// ---------------------------------------------------------------------------
// Scheduling math (shared by the reportSchedules router and the delivery
// worker). Everything is computed in UTC so it is stable across machines.
// ---------------------------------------------------------------------------

export const REPORT_CADENCES = ["daily", "weekly", "monthly"] as const;
export type ReportCadence = (typeof REPORT_CADENCES)[number];

/** The next UTC send time strictly after `from` for a cadence + time-of-day. */
export function computeNextRun(
  cadence: ReportCadence,
  opts: { hourUtc: number; dayOfWeek?: number | null; dayOfMonth?: number | null },
  from: Date
): Date {
  const hour = Math.min(Math.max(Math.trunc(opts.hourUtc), 0), 23);
  const next = new Date(from);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(hour);

  if (cadence === "daily") {
    if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }
  if (cadence === "weekly") {
    const target = (((opts.dayOfWeek ?? 1) % 7) + 7) % 7;
    let delta = (target - next.getUTCDay() + 7) % 7;
    if (delta === 0 && next <= from) delta = 7;
    next.setUTCDate(next.getUTCDate() + delta);
    return next;
  }
  // monthly: clamp to 28 so every month has the day.
  const dom = Math.min(Math.max(opts.dayOfMonth ?? 1, 1), 28);
  next.setUTCDate(dom);
  if (next <= from) {
    next.setUTCMonth(next.getUTCMonth() + 1);
    next.setUTCDate(dom);
  }
  return next;
}
