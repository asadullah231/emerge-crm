import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNull,
  lte,
  sql,
  type AnyColumn,
  type SQL
} from "drizzle-orm";
import { z } from "zod";
import {
  applicationStatusHistory,
  applications,
  candidates,
  companies,
  interviews,
  jobs,
  offers,
  placements,
  submissions,
  tasks,
  users
} from "@emerge/db";
import { APPLICATION_STAGES, STAGE_LABELS, type ApplicationStageKey } from "@/lib/applications";
import { router, workspaceProcedure } from "../trpc";

const DAY_MS = 24 * 60 * 60 * 1000;

/** The linear recruitment funnel, in order. Terminal stages sit outside it. */
const FUNNEL_STAGES = [
  "screening",
  "submitted",
  "interview",
  "offered",
  "hired"
] as const satisfies readonly ApplicationStageKey[];

/** Shared filter input for every dashboard read. */
const filterInput = z
  .object({
    from: z.date().optional(),
    to: z.date().optional(),
    ownerId: z.string().uuid().optional(),
    trendWeeks: z.number().int().min(4).max(26).default(12)
  })
  .optional();

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

/**
 * Compose an AND of the always-on predicate with the optional date-range and
 * owner filters. `dateCol`/`ownerCol` are the columns those filters apply to on
 * the table being queried (they differ per table: createdAt vs sentAt, ownerId
 * vs organizerId, ...). Undefined filters are dropped, never widened.
 */
function scoped(
  base: SQL | undefined,
  opts: {
    dateCol?: AnyColumn;
    ownerCol?: AnyColumn;
    from?: Date;
    to?: Date;
    ownerId?: string;
  }
): SQL | undefined {
  const parts: (SQL | undefined)[] = [base];
  if (opts.from && opts.dateCol) parts.push(gte(opts.dateCol, opts.from));
  if (opts.to && opts.dateCol) parts.push(lte(opts.dateCol, opts.to));
  if (opts.ownerId && opts.ownerCol) parts.push(eq(opts.ownerCol, opts.ownerId));
  return and(...parts);
}

export const dashboardRouter = router({
  /**
   * Everything the command-center dashboard needs, in one workspace-scoped query.
   * Every number is derived from real rows (RLS-scoped by the workspace tx); no
   * mock data. Optional filters narrow the flow metrics + funnel + trends to a
   * date window and/or a single recruiter; current-state counts (active jobs,
   * pipeline snapshot) always reflect now.
   *
   * A read query, so it is available to every role (read-only included).
   */
  overview: workspaceProcedure.input(filterInput).query(async ({ ctx, input }) => {
    const trendWeeks = input?.trendWeeks ?? 12;
    const from = input?.from;
    const to = input?.to;
    const ownerId = input?.ownerId;
    const trendSince = weekStart(new Date(Date.now() - (trendWeeks - 1) * 7 * DAY_MS));

    // Applications in scope (date window on createdAt + owner). Reused widely.
    const appScope = (extra?: SQL) =>
      scoped(and(isNull(applications.deletedAt), extra), {
        dateCol: applications.createdAt,
        ownerCol: applications.ownerId,
        from,
        to,
        ownerId
      });

    const [
      jobAgg,
      candAgg,
      appAgg,
      stageRows,
      scopedAppRows,
      historyRows,
      hiredHistRows,
      hiredApps,
      filledJobs,
      recruiterRows,
      submissionAgg,
      offerAgg,
      interviewAgg,
      placementAgg,
      recentCandidates,
      recentJobs,
      candTrendRows,
      appTrendRows,
      interviewTrendRows,
      jobTrendRows,
      upcomingInterviews,
      openTasks
    ] = await Promise.all([
      // Jobs: total + status breakdown (current state, unfiltered by date).
      ctx.tx
        .select({
          total: count(),
          active: sql<number>`count(*) filter (where ${jobs.status} = 'open')`,
          onHold: sql<number>`count(*) filter (where ${jobs.status} = 'on_hold')`,
          filled: sql<number>`count(*) filter (where ${jobs.status} = 'filled')`
        })
        .from(jobs)
        .where(scoped(isNull(jobs.deletedAt), { ownerCol: jobs.ownerId, ownerId })),
      // Candidates created in range.
      ctx.tx
        .select({ total: count() })
        .from(candidates)
        .where(scoped(isNull(candidates.deletedAt), { dateCol: candidates.createdAt, from, to })),
      // Applications created in range (+owner).
      ctx.tx.select({ total: count() }).from(applications).where(appScope()),
      // Applications grouped by current stage (snapshot within scope).
      ctx.tx
        .select({ stage: applications.stage, c: count() })
        .from(applications)
        .where(appScope())
        .groupBy(applications.stage),
      // Scoped application ids + current stage (for the cumulative funnel).
      ctx.tx
        .select({ id: applications.id, stage: applications.stage })
        .from(applications)
        .where(appScope()),
      // Every stage a scoped application ever reached (funnel "ever reached").
      ctx.tx
        .select({
          applicationId: applicationStatusHistory.applicationId,
          toStage: applicationStatusHistory.toStage
        })
        .from(applicationStatusHistory)
        .innerJoin(applications, eq(applications.id, applicationStatusHistory.applicationId))
        .where(appScope()),
      // Earliest "reached hired" timestamp per application (time-to-hire/fill).
      ctx.tx
        .select({
          applicationId: applicationStatusHistory.applicationId,
          hiredAt: sql<string>`min(${applicationStatusHistory.createdAt})`
        })
        .from(applicationStatusHistory)
        .where(eq(applicationStatusHistory.toStage, "hired"))
        .groupBy(applicationStatusHistory.applicationId),
      // Applications currently hired (in scope).
      ctx.tx
        .select({
          id: applications.id,
          jobId: applications.jobId,
          createdAt: applications.createdAt,
          stageEnteredAt: applications.stageEnteredAt
        })
        .from(applications)
        .where(appScope(eq(applications.stage, "hired"))),
      // Filled jobs (for time-to-fill).
      ctx.tx
        .select({ id: jobs.id, createdAt: jobs.createdAt })
        .from(jobs)
        .where(and(isNull(jobs.deletedAt), eq(jobs.status, "filled"))),
      // Recruiter performance: per owner, totals + stage breakdown.
      ctx.tx
        .select({
          userId: applications.ownerId,
          name: users.name,
          total: count(),
          submitted: sql<number>`count(*) filter (where ${applications.stage} = 'submitted')`,
          interview: sql<number>`count(*) filter (where ${applications.stage} = 'interview')`,
          offered: sql<number>`count(*) filter (where ${applications.stage} = 'offered')`,
          hired: sql<number>`count(*) filter (where ${applications.stage} = 'hired')`
        })
        .from(applications)
        .leftJoin(users, eq(users.id, applications.ownerId))
        .where(appScope())
        .groupBy(applications.ownerId, users.name),
      // Submissions sent in range (+owner = sender).
      ctx.tx
        .select({ total: count() })
        .from(submissions)
        .where(
          scoped(undefined, {
            dateCol: submissions.sentAt,
            ownerCol: submissions.sentById,
            from,
            to,
            ownerId
          })
        ),
      // Offers that left draft (sent onward) in range (+owner = creator).
      ctx.tx
        .select({ total: sql<number>`count(*) filter (where ${offers.status} <> 'draft')` })
        .from(offers)
        .where(
          scoped(undefined, {
            dateCol: offers.createdAt,
            ownerCol: offers.createdById,
            from,
            to,
            ownerId
          })
        ),
      // Interviews scheduled in range (+owner = organizer).
      ctx.tx
        .select({ total: count() })
        .from(interviews)
        .where(
          scoped(undefined, {
            dateCol: interviews.scheduledAt,
            ownerCol: interviews.organizerId,
            from,
            to,
            ownerId
          })
        ),
      // Placements (real hires) in range (+owner = placer).
      ctx.tx
        .select({ total: count() })
        .from(placements)
        .where(
          scoped(undefined, {
            dateCol: placements.createdAt,
            ownerCol: placements.placedById,
            from,
            to,
            ownerId
          })
        ),
      // Recent candidates (current, unfiltered so the panel is never empty by a date filter).
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
      // Recent jobs.
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
      // Trend inputs (respect owner; window is always the trend window).
      ctx.tx
        .select({ createdAt: candidates.createdAt })
        .from(candidates)
        .where(and(isNull(candidates.deletedAt), gte(candidates.createdAt, trendSince))),
      ctx.tx
        .select({ createdAt: applications.createdAt })
        .from(applications)
        .where(
          scoped(and(isNull(applications.deletedAt), gte(applications.createdAt, trendSince)), {
            ownerCol: applications.ownerId,
            ownerId
          })
        ),
      ctx.tx
        .select({ scheduledAt: interviews.scheduledAt })
        .from(interviews)
        .where(
          scoped(gte(interviews.scheduledAt, trendSince), {
            ownerCol: interviews.organizerId,
            ownerId
          })
        ),
      ctx.tx
        .select({ openedAt: jobs.openedAt })
        .from(jobs)
        .where(
          scoped(and(isNull(jobs.deletedAt), gte(jobs.openedAt, trendSince)), {
            ownerCol: jobs.ownerId,
            ownerId
          })
        ),
      // Upcoming interviews across the workspace (scheduled, next 14 days).
      ctx.tx
        .select({
          id: interviews.id,
          humanId: interviews.humanId,
          applicationId: interviews.applicationId,
          type: interviews.type,
          scheduledAt: interviews.scheduledAt,
          durationMins: interviews.durationMins,
          candidateFirstName: candidates.firstName,
          candidateLastName: candidates.lastName,
          jobTitle: jobs.title
        })
        .from(interviews)
        .innerJoin(applications, eq(applications.id, interviews.applicationId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(
          scoped(
            and(
              eq(interviews.status, "scheduled"),
              gte(interviews.scheduledAt, new Date(Date.now() - DAY_MS)),
              lte(interviews.scheduledAt, new Date(Date.now() + 14 * DAY_MS))
            ),
            { ownerCol: interviews.organizerId, ownerId }
          )
        )
        .orderBy(asc(interviews.scheduledAt))
        .limit(6),
      // Open tasks & follow-ups (soonest due first).
      ctx.tx
        .select({
          id: tasks.id,
          subject: tasks.subject,
          dueAt: tasks.dueAt,
          status: tasks.status,
          entityType: tasks.entityType,
          entityId: tasks.entityId,
          assigneeName: users.name
        })
        .from(tasks)
        .leftJoin(users, eq(users.id, tasks.assigneeId))
        .where(
          scoped(sql`${tasks.status} <> 'done'`, {
            ownerCol: tasks.assigneeId,
            ownerId
          })
        )
        .orderBy(sql`${tasks.dueAt} asc nulls last`, desc(tasks.createdAt))
        .limit(6)
    ]);

    // Stage snapshot, all stages present (0 when absent).
    const stageCounts = Object.fromEntries(APPLICATION_STAGES.map((s) => [s, 0])) as Record<
      ApplicationStageKey,
      number
    >;
    for (const r of stageRows) stageCounts[r.stage as ApplicationStageKey] = Number(r.c);

    // Cumulative funnel: how far each scoped application ever progressed.
    const stageIdx = new Map<string, number>(FUNNEL_STAGES.map((s, i) => [s, i]));
    const maxReached = new Map<string, number>();
    for (const a of scopedAppRows) {
      maxReached.set(a.id, stageIdx.get(a.stage) ?? 0);
    }
    for (const h of historyRows) {
      const idx = stageIdx.get(h.toStage);
      if (idx == null || !h.applicationId) continue;
      const prev = maxReached.get(h.applicationId) ?? 0;
      if (idx > prev) maxReached.set(h.applicationId, idx);
    }
    const funnelCounts = FUNNEL_STAGES.map(
      (_s, k) => [...maxReached.values()].filter((m) => m >= k).length
    );
    const funnel = FUNNEL_STAGES.map((stage, k) => ({
      stage,
      label: STAGE_LABELS[stage],
      count: funnelCounts[k]!,
      // Conversion from the previous funnel stage (null for the first stage).
      conversion:
        k === 0 || funnelCounts[k - 1]! === 0 ? null : funnelCounts[k]! / funnelCounts[k - 1]!
    }));

    // Time-to-hire: days between application creation and reaching hired.
    const hiredAtById = new Map<string, number>();
    for (const h of hiredHistRows) {
      if (h.applicationId && h.hiredAt)
        hiredAtById.set(h.applicationId, new Date(h.hiredAt).getTime());
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

    // Time-to-fill: for filled jobs with a hire, days from job creation to first hire.
    const fillDurations: number[] = [];
    for (const j of filledJobs) {
      const hiredAt = earliestHireByJob.get(j.id);
      if (hiredAt == null) continue;
      const days = (hiredAt - j.createdAt.getTime()) / DAY_MS;
      if (days >= 0) fillDurations.push(days);
    }
    const timeToFillDays = avgOrNull(fillDurations);

    // Weekly multi-series trends.
    type Bucket = { candidates: number; applications: number; interviews: number; jobs: number };
    const buckets = new Map<number, Bucket>();
    for (let i = trendWeeks - 1; i >= 0; i--) {
      const ws = weekStart(new Date(Date.now() - i * 7 * DAY_MS)).getTime();
      buckets.set(ws, { candidates: 0, applications: 0, interviews: 0, jobs: 0 });
    }
    const bump = (d: Date, key: keyof Bucket) => {
      const b = buckets.get(weekStart(d).getTime());
      if (b) b[key]++;
    };
    for (const r of candTrendRows) bump(r.createdAt, "candidates");
    for (const r of appTrendRows) bump(r.createdAt, "applications");
    for (const r of interviewTrendRows) bump(r.scheduledAt, "interviews");
    for (const r of jobTrendRows) bump(r.openedAt, "jobs");
    const trends = [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([ws, v]) => ({ weekStart: new Date(ws), ...v }));

    const recruiterPerformance = recruiterRows
      .filter((r) => r.userId != null)
      .map((r) => ({
        userId: r.userId as string,
        name: r.name ?? "Unassigned",
        total: Number(r.total),
        submitted: Number(r.submitted),
        interview: Number(r.interview),
        offered: Number(r.offered),
        hired: Number(r.hired)
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
        submissions: Number(submissionAgg[0]?.total ?? 0),
        interviews: Number(interviewAgg[0]?.total ?? 0),
        submitted: stageCounts.submitted,
        interview: stageCounts.interview,
        offered: stageCounts.offered,
        offers: Number(offerAgg[0]?.total ?? 0),
        hired: stageCounts.hired,
        hires: Number(placementAgg[0]?.total ?? 0),
        rejected: stageCounts.rejected,
        timeToHireDays,
        timeToFillDays
      },
      funnel,
      outcomes: {
        hired: stageCounts.hired,
        rejected: stageCounts.rejected,
        archived: stageCounts.archived
      },
      trends,
      recruiterPerformance,
      upcomingInterviews,
      openTasks,
      recentCandidates,
      recentJobs
    };
  }),

  /**
   * Drill-down: the applications currently in one pipeline stage, within the
   * same date/owner scope as the overview. Powers the click-through panel under
   * the funnel. Read-only, workspace-scoped.
   */
  applicationsByStage: workspaceProcedure
    .input(
      z.object({
        stage: z.enum(APPLICATION_STAGES),
        from: z.date().optional(),
        to: z.date().optional(),
        ownerId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(50).default(20)
      })
    )
    .query(async ({ ctx, input }) => {
      const where = scoped(
        and(isNull(applications.deletedAt), eq(applications.stage, input.stage)),
        {
          dateCol: applications.createdAt,
          ownerCol: applications.ownerId,
          from: input.from,
          to: input.to,
          ownerId: input.ownerId
        }
      );
      return ctx.tx
        .select({
          id: applications.id,
          humanId: applications.humanId,
          createdAt: applications.createdAt,
          candidateFirstName: candidates.firstName,
          candidateLastName: candidates.lastName,
          candidateHumanId: candidates.humanId,
          jobTitle: jobs.title,
          ownerName: users.name
        })
        .from(applications)
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .leftJoin(users, eq(users.id, applications.ownerId))
        .where(where)
        .orderBy(desc(applications.stageEnteredAt))
        .limit(input.limit);
    })
});
