import { and, count, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  applicationStatusHistory,
  applications,
  candidates,
  companies,
  jobs,
  users
} from "@emerge/db";
import { APPLICATION_STAGES, STAGE_LABELS, type ApplicationStageKey } from "@/lib/applications";
import { router, workspaceProcedure } from "../trpc";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Average of a numeric list, rounded, or null when the list is empty. */
function avgOrNull(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Monday 00:00 (local server tz) for the week containing `d`. */
function weekStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x;
}

export const dashboardRouter = router({
  /**
   * Everything the command-center dashboard needs, in one workspace-scoped query.
   * Every number is derived from real rows (RLS-scoped by the workspace tx); no
   * mock data. Modules not built yet (interviews/tasks lists) are simply absent
   * here and rendered as empty states by the client.
   *
   * A read query, so it is available to every role (read-only included); the
   * workspace tx already scopes it to the caller's workspace.
   */
  overview: workspaceProcedure
    .input(z.object({ trendWeeks: z.number().int().min(4).max(26).default(12) }).optional())
    .query(async ({ ctx, input }) => {
      const trendWeeks = input?.trendWeeks ?? 12;
      const trendSince = new Date(Date.now() - trendWeeks * 7 * DAY_MS);

      const [
        jobAgg,
        candAgg,
        appAgg,
        stageRows,
        hiredHistRows,
        hiredApps,
        filledJobs,
        recruiterRows,
        recentCandidates,
        recentJobs,
        candTrendRows,
        appTrendRows
      ] = await Promise.all([
        // Jobs: total + active (open)
        ctx.tx
          .select({
            total: count(),
            active: sql<number>`count(*) filter (where ${jobs.status} = 'open')`,
            onHold: sql<number>`count(*) filter (where ${jobs.status} = 'on_hold')`,
            filled: sql<number>`count(*) filter (where ${jobs.status} = 'filled')`
          })
          .from(jobs)
          .where(isNull(jobs.deletedAt)),
        // Candidates: total
        ctx.tx.select({ total: count() }).from(candidates).where(isNull(candidates.deletedAt)),
        // Applications: total
        ctx.tx.select({ total: count() }).from(applications).where(isNull(applications.deletedAt)),
        // Applications grouped by stage
        ctx.tx
          .select({ stage: applications.stage, c: count() })
          .from(applications)
          .where(isNull(applications.deletedAt))
          .groupBy(applications.stage),
        // Earliest "reached hired" timestamp per application (for time-to-hire/fill)
        ctx.tx
          .select({
            applicationId: applicationStatusHistory.applicationId,
            hiredAt: sql<string>`min(${applicationStatusHistory.createdAt})`
          })
          .from(applicationStatusHistory)
          .where(eq(applicationStatusHistory.toStage, "hired"))
          .groupBy(applicationStatusHistory.applicationId),
        // Applications currently in the hired stage
        ctx.tx
          .select({
            id: applications.id,
            jobId: applications.jobId,
            createdAt: applications.createdAt,
            stageEnteredAt: applications.stageEnteredAt
          })
          .from(applications)
          .where(and(isNull(applications.deletedAt), eq(applications.stage, "hired"))),
        // Filled jobs (for time-to-fill)
        ctx.tx
          .select({ id: jobs.id, createdAt: jobs.createdAt })
          .from(jobs)
          .where(and(isNull(jobs.deletedAt), eq(jobs.status, "filled"))),
        // Recruiter performance: per owner, totals + hired + submitted
        ctx.tx
          .select({
            userId: applications.ownerId,
            name: users.name,
            total: count(),
            hired: sql<number>`count(*) filter (where ${applications.stage} = 'hired')`,
            submitted: sql<number>`count(*) filter (where ${applications.stage} = 'submitted')`,
            interview: sql<number>`count(*) filter (where ${applications.stage} = 'interview')`
          })
          .from(applications)
          .leftJoin(users, eq(users.id, applications.ownerId))
          .where(isNull(applications.deletedAt))
          .groupBy(applications.ownerId, users.name),
        // Recent candidates
        ctx.tx
          .select({
            id: candidates.id,
            humanId: candidates.humanId,
            firstName: candidates.firstName,
            lastName: candidates.lastName,
            title: candidates.title,
            createdAt: candidates.createdAt
          })
          .from(candidates)
          .where(isNull(candidates.deletedAt))
          .orderBy(desc(candidates.createdAt))
          .limit(6),
        // Recent jobs
        ctx.tx
          .select({
            id: jobs.id,
            humanId: jobs.humanId,
            title: jobs.title,
            status: jobs.status,
            createdAt: jobs.createdAt,
            companyName: companies.name
          })
          .from(jobs)
          .leftJoin(companies, eq(companies.id, jobs.companyId))
          .where(isNull(jobs.deletedAt))
          .orderBy(desc(jobs.createdAt))
          .limit(6),
        // Trend inputs: candidate createdAt within window
        ctx.tx
          .select({ createdAt: candidates.createdAt })
          .from(candidates)
          .where(and(isNull(candidates.deletedAt), gte(candidates.createdAt, trendSince))),
        // Trend inputs: application createdAt within window
        ctx.tx
          .select({ createdAt: applications.createdAt })
          .from(applications)
          .where(and(isNull(applications.deletedAt), gte(applications.createdAt, trendSince)))
      ]);

      // Stage counts, all stages present (0 when absent).
      const stageCounts = Object.fromEntries(
        APPLICATION_STAGES.map((s) => [s, 0])
      ) as Record<ApplicationStageKey, number>;
      for (const r of stageRows) stageCounts[r.stage as ApplicationStageKey] = Number(r.c);

      const pipeline = APPLICATION_STAGES.map((stage) => ({
        stage,
        label: STAGE_LABELS[stage],
        count: stageCounts[stage]
      }));

      // Time-to-hire: days between application creation and reaching hired.
      const hiredAtById = new Map<string, number>();
      for (const h of hiredHistRows) {
        if (h.applicationId && h.hiredAt) hiredAtById.set(h.applicationId, new Date(h.hiredAt).getTime());
      }
      const hireDurations: number[] = [];
      const earliestHireByJob = new Map<string, number>();
      for (const a of hiredApps) {
        const hiredAt = hiredAtById.get(a.id) ?? a.stageEnteredAt?.getTime() ?? null;
        if (hiredAt == null) continue;
        const days = (hiredAt - a.createdAt.getTime()) / DAY_MS;
        if (days >= 0) hireDurations.push(days);
        const prev = earliestHireByJob.get(a.jobId);
        if (prev == null || hiredAt < prev) earliestHireByJob.set(a.jobId, hiredAt);
      }
      const timeToHireDays = avgOrNull(hireDurations);

      // Time-to-fill: for filled jobs that have a hire, days from job creation to
      // the first hire on that job.
      const fillDurations: number[] = [];
      for (const j of filledJobs) {
        const hiredAt = earliestHireByJob.get(j.id);
        if (hiredAt == null) continue;
        const days = (hiredAt - j.createdAt.getTime()) / DAY_MS;
        if (days >= 0) fillDurations.push(days);
      }
      const timeToFillDays = avgOrNull(fillDurations);

      // Weekly trends (candidates + applications created per week).
      const buckets = new Map<number, { candidates: number; applications: number }>();
      for (let i = trendWeeks - 1; i >= 0; i--) {
        const ws = weekStart(new Date(Date.now() - i * 7 * DAY_MS)).getTime();
        buckets.set(ws, { candidates: 0, applications: 0 });
      }
      const bucketKey = (d: Date) => weekStart(d).getTime();
      for (const r of candTrendRows) {
        const k = bucketKey(r.createdAt);
        const b = buckets.get(k);
        if (b) b.candidates++;
      }
      for (const r of appTrendRows) {
        const k = bucketKey(r.createdAt);
        const b = buckets.get(k);
        if (b) b.applications++;
      }
      const trends = [...buckets.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([ws, v]) => ({ weekStart: new Date(ws), ...v }));

      const recruiterPerformance = recruiterRows
        .filter((r) => r.userId != null)
        .map((r) => ({
          userId: r.userId as string,
          name: r.name ?? "Unassigned",
          total: Number(r.total),
          hired: Number(r.hired),
          submitted: Number(r.submitted),
          interview: Number(r.interview)
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

      const jobs0 = jobAgg[0];
      return {
        kpis: {
          activeJobs: Number(jobs0?.active ?? 0),
          onHoldJobs: Number(jobs0?.onHold ?? 0),
          filledJobs: Number(jobs0?.filled ?? 0),
          totalJobs: Number(jobs0?.total ?? 0),
          totalCandidates: Number(candAgg[0]?.total ?? 0),
          totalApplications: Number(appAgg[0]?.total ?? 0),
          submitted: stageCounts.submitted,
          interview: stageCounts.interview,
          offered: stageCounts.offered,
          hired: stageCounts.hired,
          rejected: stageCounts.rejected,
          timeToHireDays,
          timeToFillDays
        },
        pipeline,
        trends,
        recruiterPerformance,
        recentCandidates,
        recentJobs
      };
    })
});
