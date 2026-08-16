/**
 * Scheduled report delivery (M14). Sweeps every active report schedule whose
 * next_run_at has passed, computes the report, and emails it as a CSV. Runs on
 * the owner connection (RLS-bypassing), scoping each report by its workspace id,
 * so one pass covers all workspaces. Idempotent per tick: after sending, the row
 * is advanced to its next run time, so it will not re-fire until then.
 */
import { and, eq, lte } from "drizzle-orm";
import { reportSchedules, runReport, type Database } from "@emerge/db";
import {
  REPORT_KEYS,
  computeNextRun,
  reportToCsv,
  type ReportCadence,
  type ReportFilters,
  type ReportKey
} from "@emerge/reports";
import { sendReportEmail } from "../email";

/** Turn the stored jsonb filters (ISO date strings) back into ReportFilters. */
function parseFilters(raw: Record<string, unknown> | null): ReportFilters {
  if (!raw) return {};
  const f: ReportFilters = {};
  if (typeof raw.from === "string") f.from = new Date(raw.from);
  if (typeof raw.to === "string") f.to = new Date(raw.to);
  if (typeof raw.userId === "string") f.userId = raw.userId;
  if (typeof raw.companyId === "string") f.companyId = raw.companyId;
  return f;
}

const isReportKey = (k: string): k is ReportKey => (REPORT_KEYS as readonly string[]).includes(k);

export async function deliverDueReports(db: Database, now = new Date()): Promise<number> {
  const due = await db
    .select()
    .from(reportSchedules)
    .where(and(eq(reportSchedules.active, true), lte(reportSchedules.nextRunAt, now)));
  if (due.length === 0) return 0;

  let delivered = 0;
  for (const s of due) {
    try {
      if (isReportKey(s.reportKey)) {
        const table = await runReport(db, s.workspaceId, s.reportKey, parseFilters(s.filters));
        const csv = reportToCsv(table);
        const stamp = now.toISOString().slice(0, 10);
        await sendReportEmail({
          to: s.recipients,
          subject: `${table.title} — ${stamp}`,
          html: `<p>Your scheduled report "<strong>${table.title}</strong>" is attached as a CSV.</p>`,
          text: `Your scheduled report "${table.title}" is attached as a CSV.`,
          csv: { filename: `${s.reportKey}-${stamp}.csv`, content: csv }
        });
        delivered += 1;
      } else {
        console.error(`[worker] report schedule ${s.id} has unknown report key "${s.reportKey}"`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[worker] report schedule ${s.id} failed:`, msg);
    }

    // Always advance next_run_at so a failing schedule does not spin every tick.
    const nextRunAt = computeNextRun(
      s.cadence as ReportCadence,
      { hourUtc: s.hourUtc, dayOfWeek: s.dayOfWeek, dayOfMonth: s.dayOfMonth },
      now
    );
    await db
      .update(reportSchedules)
      .set({ lastRunAt: now, nextRunAt, updatedAt: now })
      .where(eq(reportSchedules.id, s.id));
  }
  return delivered;
}
