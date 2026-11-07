import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import {
  applicationStage,
  applicationStatusHistory,
  applications,
  auditLog,
  candidates,
  companies,
  jobRecruiters,
  jobs,
  memberships,
  notes,
  tasks,
  users
} from "@emerge/db";
import { router, workspaceProcedure } from "../trpc";

const DAY_MS = 24 * 60 * 60 * 1000;
/** Rolling comparison window used across the report (spec: 4 weeks). */
const ROLLING_DAYS = 28;

const windowInput = z.object({ from: z.date(), to: z.date() });

/** yyyy-mm-dd bucket key (UTC; workspace runs on UK time where this matches business days). */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday 00:00 UTC for the week containing `d`. */
function weekStartUtc(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // 0 = Monday
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}

type StageCounts = {
  shortlisted: number;
  submitted: number;
  interview: number;
  rejected: number;
};

function emptyCounts(): StageCounts {
  return { shortlisted: 0, submitted: 0, interview: 0, rejected: 0 };
}

/**
 * RD-1 (Reporting Dashboard): per-recruiter activity report. Every count is
 * attributed to the user who PERFORMED the status change (history.actorUserId)
 * and counted on the date the change happened - matching how Mo's team reads
 * "shortlisted this week". Null-actor rows (API/automation) are left out of
 * per-user rows but included in team totals.
 */
export const recruiterReportsRouter = router({
  overview: workspaceProcedure.input(windowInput).query(async ({ ctx, input }) => {
    const { from, to } = input;
    const from4 = new Date(to.getTime() - ROLLING_DAYS * DAY_MS);
    const trendFrom = weekStartUtc(new Date(to.getTime() - 21 * DAY_MS));

    const [members, windowRows, rollingRows, submittedRows, rejection4wRows, openJobs] =
      await Promise.all([
        ctx.tx
          .select({
            userId: memberships.userId,
            name: users.name,
            role: memberships.role
          })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(isNull(memberships.deactivatedAt))
          .orderBy(users.name),
        ctx.tx
          .select({
            actorId: applicationStatusHistory.actorUserId,
            actorName: users.name,
            toStage: applicationStatusHistory.toStage,
            n: sql<number>`count(*)::int`
          })
          .from(applicationStatusHistory)
          .leftJoin(users, eq(users.id, applicationStatusHistory.actorUserId))
          .where(
            and(
              gte(applicationStatusHistory.createdAt, from),
              lte(applicationStatusHistory.createdAt, to)
            )
          )
          .groupBy(
            applicationStatusHistory.actorUserId,
            users.name,
            applicationStatusHistory.toStage
          ),
        ctx.tx
          .select({
            actorId: applicationStatusHistory.actorUserId,
            toStage: applicationStatusHistory.toStage,
            n: sql<number>`count(*)::int`
          })
          .from(applicationStatusHistory)
          .where(
            and(
              gte(applicationStatusHistory.createdAt, from4),
              lte(applicationStatusHistory.createdAt, to)
            )
          )
          .groupBy(applicationStatusHistory.actorUserId, applicationStatusHistory.toStage),
        ctx.tx
          .select({
            applicationId: applicationStatusHistory.applicationId,
            actorId: applicationStatusHistory.actorUserId,
            createdAt: applicationStatusHistory.createdAt
          })
          .from(applicationStatusHistory)
          .where(
            and(
              eq(applicationStatusHistory.toStage, "submitted"),
              gte(applicationStatusHistory.createdAt, from),
              lte(applicationStatusHistory.createdAt, to)
            )
          ),
        ctx.tx
          .select({
            actorId: applicationStatusHistory.actorUserId,
            note: applicationStatusHistory.note
          })
          .from(applicationStatusHistory)
          .where(
            and(
              eq(applicationStatusHistory.toStage, "rejected"),
              gte(applicationStatusHistory.createdAt, from4),
              lte(applicationStatusHistory.createdAt, to)
            )
          ),
        ctx.tx
          .select({
            id: jobs.id,
            title: jobs.title,
            openedAt: jobs.openedAt,
            companyName: companies.name
          })
          .from(jobs)
          .innerJoin(companies, eq(companies.id, jobs.companyId))
          .where(and(eq(jobs.status, "open"), isNull(jobs.deletedAt)))
      ]);

    // --- Downstream: of the window's submissions, which reached further stages?
    const submittedAppIds = [...new Set(submittedRows.map((r) => r.applicationId))];
    const advanceRows = submittedAppIds.length
      ? await ctx.tx
          .select({
            applicationId: applicationStatusHistory.applicationId,
            toStage: applicationStatusHistory.toStage,
            createdAt: applicationStatusHistory.createdAt
          })
          .from(applicationStatusHistory)
          .where(
            and(
              inArray(applicationStatusHistory.applicationId, submittedAppIds),
              inArray(applicationStatusHistory.toStage, ["interview", "offered", "hired"])
            )
          )
      : [];

    // --- Sourcing health inputs
    const openJobIds = openJobs.map((j) => j.id);
    const [firstShortlists, firstAssigns, jobRecRows, trendRows] = await Promise.all([
      ctx.tx
        .select({
          jobId: applications.jobId,
          first: sql<string>`min(${applicationStatusHistory.createdAt})`
        })
        .from(applicationStatusHistory)
        .innerJoin(applications, eq(applications.id, applicationStatusHistory.applicationId))
        .where(eq(applicationStatusHistory.toStage, "shortlisted"))
        .groupBy(applications.jobId),
      ctx.tx
        .select({
          jobId: jobRecruiters.jobId,
          first: sql<string>`min(${jobRecruiters.createdAt})`
        })
        .from(jobRecruiters)
        .groupBy(jobRecruiters.jobId),
      openJobIds.length
        ? ctx.tx
            .select({ jobId: jobRecruiters.jobId, name: users.name })
            .from(jobRecruiters)
            .innerJoin(users, eq(users.id, jobRecruiters.userId))
            .where(inArray(jobRecruiters.jobId, openJobIds))
        : Promise.resolve([] as { jobId: string; name: string }[]),
      ctx.tx
        .select({ createdAt: applicationStatusHistory.createdAt })
        .from(applicationStatusHistory)
        .where(
          and(
            eq(applicationStatusHistory.toStage, "shortlisted"),
            gte(applicationStatusHistory.createdAt, trendFrom),
            lte(applicationStatusHistory.createdAt, to)
          )
        )
    ]);

    // ---- Assemble per-user window counts (include non-member actors with activity)
    const perUser = new Map<string, { name: string; counts: StageCounts }>();
    for (const m of members) perUser.set(m.userId, { name: m.name, counts: emptyCounts() });
    const totals = emptyCounts();
    for (const r of windowRows) {
      const stage = r.toStage as keyof StageCounts;
      if (stage in totals) totals[stage] += r.n;
      if (!r.actorId) continue;
      let entry = perUser.get(r.actorId);
      if (!entry) {
        entry = { name: r.actorName ?? "Former member", counts: emptyCounts() };
        perUser.set(r.actorId, entry);
      }
      if (stage in entry.counts) entry.counts[stage] += r.n;
    }

    const rolling = new Map<string, StageCounts>();
    const rollingTotals = emptyCounts();
    for (const r of rollingRows) {
      const stage = r.toStage as keyof StageCounts;
      if (stage in rollingTotals) rollingTotals[stage] += r.n;
      if (!r.actorId) continue;
      const entry = rolling.get(r.actorId) ?? emptyCounts();
      if (stage in entry) entry[stage] += r.n;
      rolling.set(r.actorId, entry);
    }

    // ---- Downstream per actor: distinct submitted apps -> later stages reached
    const advancesByApp = new Map<string, { toStage: string; createdAt: Date }[]>();
    for (const a of advanceRows) {
      const list = advancesByApp.get(a.applicationId) ?? [];
      list.push({ toStage: a.toStage, createdAt: a.createdAt });
      advancesByApp.set(a.applicationId, list);
    }
    const downstream = new Map<
      string,
      { submitted: number; interview: number; offered: number; hired: number }
    >();
    const seenActorApp = new Set<string>();
    for (const s of submittedRows) {
      if (!s.actorId) continue;
      const key = `${s.actorId}|${s.applicationId}`;
      if (seenActorApp.has(key)) continue; // count each application once per recruiter
      seenActorApp.add(key);
      const entry = downstream.get(s.actorId) ?? {
        submitted: 0,
        interview: 0,
        offered: 0,
        hired: 0
      };
      entry.submitted += 1;
      const later = advancesByApp.get(s.applicationId) ?? [];
      if (later.some((l) => l.toStage === "interview" && l.createdAt >= s.createdAt))
        entry.interview += 1;
      if (later.some((l) => l.toStage === "offered" && l.createdAt >= s.createdAt))
        entry.offered += 1;
      if (later.some((l) => l.toStage === "hired" && l.createdAt >= s.createdAt)) entry.hired += 1;
      downstream.set(s.actorId, entry);
    }

    // ---- Top rejection reasons (rolling window) per recruiter + team
    const reasonCounts = new Map<string, Map<string, number>>(); // actor -> reason -> n
    const teamReasons = new Map<string, number>();
    for (const r of rejection4wRows) {
      const reason = (r.note ?? "").trim();
      if (!reason) continue;
      const norm = reason.toLowerCase();
      teamReasons.set(norm, (teamReasons.get(norm) ?? 0) + 1);
      if (!r.actorId) continue;
      const m = reasonCounts.get(r.actorId) ?? new Map<string, number>();
      m.set(norm, (m.get(norm) ?? 0) + 1);
      reasonCounts.set(r.actorId, m);
    }
    const topOf = (m: Map<string, number>, n: number) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n)
        .map(([reason, count]) => ({ reason, count }));

    // ---- Sourcing health
    const shortlistByJob = new Map(firstShortlists.map((r) => [r.jobId, new Date(r.first)]));
    const assignByJob = new Map(firstAssigns.map((r) => [r.jobId, new Date(r.first)]));
    const recruitersByJob = new Map<string, string[]>();
    for (const r of jobRecRows) {
      const list = recruitersByJob.get(r.jobId) ?? [];
      list.push(r.name);
      recruitersByJob.set(r.jobId, list);
    }
    const now = Date.now();
    const zeroShortlistJobs = openJobs
      .filter((j) => !shortlistByJob.has(j.id))
      .map((j) => ({
        id: j.id,
        title: j.title,
        companyName: j.companyName,
        daysOpen: Math.floor((now - j.openedAt.getTime()) / DAY_MS),
        recruiters: recruitersByJob.get(j.id) ?? []
      }))
      .sort((a, b) => b.daysOpen - a.daysOpen);

    const recentFirstShortlistDays: number[] = [];
    for (const [jobId, first] of shortlistByJob) {
      if (first.getTime() < from4.getTime() || first.getTime() > to.getTime()) continue;
      const start = assignByJob.get(jobId);
      const job = openJobs.find((j) => j.id === jobId);
      const baseline = start ?? job?.openedAt;
      if (!baseline) continue;
      const days = Math.max(0, Math.round((first.getTime() - baseline.getTime()) / DAY_MS));
      recentFirstShortlistDays.push(days);
    }
    const avgDaysToFirstShortlist = recentFirstShortlistDays.length
      ? Math.round(
          recentFirstShortlistDays.reduce((a, b) => a + b, 0) / recentFirstShortlistDays.length
        )
      : null;

    const trend = new Map<string, number>();
    for (const r of trendRows) {
      const k = dayKey(weekStartUtc(r.createdAt));
      trend.set(k, (trend.get(k) ?? 0) + 1);
    }
    const weeklyShortlistTrend = [0, 1, 2, 3].map((i) => {
      const ws = new Date(trendFrom.getTime() + i * 7 * DAY_MS);
      const k = dayKey(ws);
      return { weekStart: k, count: trend.get(k) ?? 0 };
    });

    const memberIds = new Set(members.map((m) => m.userId));
    const extraActors = [...perUser.keys()].filter((id) => !memberIds.has(id));

    return {
      rows: [
        ...members.map((m) => ({
          userId: m.userId,
          name: m.name,
          role: m.role,
          active: true,
          week: perUser.get(m.userId)?.counts ?? emptyCounts(),
          rolling4w: rolling.get(m.userId) ?? emptyCounts(),
          downstream: downstream.get(m.userId) ?? {
            submitted: 0,
            interview: 0,
            offered: 0,
            hired: 0
          },
          topRejectionReasons: topOf(reasonCounts.get(m.userId) ?? new Map(), 3)
        })),
        ...extraActors.map((id) => ({
          userId: id,
          name: perUser.get(id)?.name ?? "Former member",
          role: "recruiter" as const,
          active: false,
          week: perUser.get(id)?.counts ?? emptyCounts(),
          rolling4w: rolling.get(id) ?? emptyCounts(),
          downstream: downstream.get(id) ?? { submitted: 0, interview: 0, offered: 0, hired: 0 },
          topRejectionReasons: topOf(reasonCounts.get(id) ?? new Map(), 3)
        }))
      ],
      totals: { week: totals, rolling4w: rollingTotals },
      teamTopRejectionReasons: topOf(teamReasons, 5),
      sourcing: {
        zeroShortlistJobs,
        avgDaysToFirstShortlist,
        firstShortlistSample: recentFirstShortlistDays.length,
        weeklyShortlistTrend
      }
    };
  }),

  /** Click-through list behind every scoreboard count (counts by status-change date). */
  changeList: workspaceProcedure
    .input(
      windowInput.extend({
        toStage: z.enum(applicationStage.enumValues),
        userId: z.string().uuid().optional()
      })
    )
    .query(async ({ ctx, input }) => {
      const where = and(
        eq(applicationStatusHistory.toStage, input.toStage),
        gte(applicationStatusHistory.createdAt, input.from),
        lte(applicationStatusHistory.createdAt, input.to),
        input.userId ? eq(applicationStatusHistory.actorUserId, input.userId) : undefined
      );
      return ctx.tx
        .select({
          id: applicationStatusHistory.id,
          createdAt: applicationStatusHistory.createdAt,
          toStatusKey: applicationStatusHistory.toStatusKey,
          note: applicationStatusHistory.note,
          actorName: users.name,
          applicationId: applicationStatusHistory.applicationId,
          candidateId: candidates.id,
          candidateFirstName: candidates.firstName,
          candidateLastName: candidates.lastName,
          jobId: jobs.id,
          jobTitle: jobs.title,
          companyName: companies.name,
          rejectedBy: applications.rejectedBy,
          rejectionReason: applications.rejectionReason
        })
        .from(applicationStatusHistory)
        .innerJoin(applications, eq(applications.id, applicationStatusHistory.applicationId))
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .innerJoin(companies, eq(companies.id, jobs.companyId))
        .leftJoin(users, eq(users.id, applicationStatusHistory.actorUserId))
        .where(where)
        .orderBy(desc(applicationStatusHistory.createdAt))
        .limit(500);
    }),

  /** Mon-Fri daily activity per member: candidates added, calls/meetings logged, status changes, tasks done. */
  dailyActivity: workspaceProcedure.input(windowInput).query(async ({ ctx, input }) => {
    const { from, to } = input;
    const [added, noteRows, changeRows, taskRows] = await Promise.all([
      ctx.tx
        .select({ actorId: auditLog.actorUserId, createdAt: auditLog.createdAt })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "candidate.created"),
            gte(auditLog.createdAt, from),
            lte(auditLog.createdAt, to)
          )
        ),
      ctx.tx
        .select({ authorId: notes.authorId, kind: notes.kind, createdAt: notes.createdAt })
        .from(notes)
        .where(and(isNull(notes.deletedAt), gte(notes.createdAt, from), lte(notes.createdAt, to))),
      ctx.tx
        .select({
          actorId: applicationStatusHistory.actorUserId,
          createdAt: applicationStatusHistory.createdAt
        })
        .from(applicationStatusHistory)
        .where(
          and(
            gte(applicationStatusHistory.createdAt, from),
            lte(applicationStatusHistory.createdAt, to)
          )
        ),
      ctx.tx
        .select({ assigneeId: tasks.assigneeId, completedAt: tasks.completedAt })
        .from(tasks)
        .where(and(gte(tasks.completedAt, from), lte(tasks.completedAt, to)))
    ]);

    type DayRow = {
      candidatesAdded: number;
      calls: number;
      meetings: number;
      otherNotes: number;
      statusChanges: number;
      tasksDone: number;
    };
    const rows = new Map<string, DayRow>(); // `${userId}|${day}` and `team|${day}`
    const bump = (userId: string | null, at: Date, field: keyof DayRow) => {
      for (const key of [userId ? `${userId}|${dayKey(at)}` : null, `team|${dayKey(at)}`]) {
        if (!key) continue;
        const row =
          rows.get(key) ??
          ({
            candidatesAdded: 0,
            calls: 0,
            meetings: 0,
            otherNotes: 0,
            statusChanges: 0,
            tasksDone: 0
          } satisfies DayRow);
        row[field] += 1;
        rows.set(key, row);
      }
    };

    for (const r of added) bump(r.actorId, r.createdAt, "candidatesAdded");
    for (const r of noteRows) {
      const field = r.kind === "call" ? "calls" : r.kind === "meeting" ? "meetings" : "otherNotes";
      bump(r.authorId, r.createdAt, field);
    }
    for (const r of changeRows) bump(r.actorId, r.createdAt, "statusChanges");
    for (const r of taskRows) {
      if (r.completedAt) bump(r.assigneeId, r.completedAt, "tasksDone");
    }

    return [...rows.entries()].map(([key, counts]) => {
      const [userId, day] = key.split("|");
      return { userId, day, ...counts };
    });
  })
});
