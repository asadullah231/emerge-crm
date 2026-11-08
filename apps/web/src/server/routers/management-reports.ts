import { and, eq, gte, inArray, isNull, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import {
  applicationStatusHistory,
  applications,
  companies,
  jobs,
  memberships,
  users
} from "@emerge/db";
import { router, workspaceProcedure } from "../trpc";

const DAY_MS = 24 * 60 * 60 * 1000;

const input = z.object({
  from: z.date(),
  to: z.date(),
  consultantId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional()
});

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
}

/**
 * RD-4 (Reporting Dashboard): management view for Mo. Conversion is
 * cohort-based: of the applications submitted in the window, how many have
 * (ever since) reached interview, and so on - the same way the recruiter
 * view counts downstream results. "Client response" (decision C) is the
 * first stage change after a submission.
 */
export const managementReportsRouter = router({
  overview: workspaceProcedure.input(input).query(async ({ ctx, input: f }) => {
    const { from, to, consultantId, clientId } = f;

    /** Stage events in the window, with the optional consultant/client filters. */
    const eventsIn = (stage: "submitted" | "interview" | "offered" | "hired") => {
      const clauses: (SQL | undefined)[] = [
        eq(applicationStatusHistory.toStage, stage),
        gte(applicationStatusHistory.createdAt, from),
        lte(applicationStatusHistory.createdAt, to),
        consultantId ? eq(applicationStatusHistory.actorUserId, consultantId) : undefined,
        clientId ? eq(jobs.companyId, clientId) : undefined
      ];
      return ctx.tx
        .select({
          applicationId: applicationStatusHistory.applicationId,
          createdAt: applicationStatusHistory.createdAt
        })
        .from(applicationStatusHistory)
        .innerJoin(applications, eq(applications.id, applicationStatusHistory.applicationId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(and(...clauses));
    };

    const jobClauses: (SQL | undefined)[] = [
      isNull(jobs.deletedAt),
      consultantId ? eq(jobs.ownerId, consultantId) : undefined,
      clientId ? eq(jobs.companyId, clientId) : undefined
    ];

    const [
      subEvents,
      intEvents,
      offerEvents,
      hireEvents,
      closedJobs,
      firstSubmissions,
      members,
      clients
    ] = await Promise.all([
      eventsIn("submitted"),
      eventsIn("interview"),
      eventsIn("offered"),
      eventsIn("hired"),
      ctx.tx
        .select({
          id: jobs.id,
          status: jobs.status,
          openedAt: jobs.openedAt,
          closedAt: jobs.closedAt
        })
        .from(jobs)
        .where(and(...jobClauses, gte(jobs.closedAt, from), lte(jobs.closedAt, to))),
      // First-ever submission per job; we keep the ones that landed in the window.
      ctx.tx
        .select({
          jobId: applications.jobId,
          openedAt: jobs.openedAt,
          first: sql<string>`min(${applicationStatusHistory.createdAt})`
        })
        .from(applicationStatusHistory)
        .innerJoin(applications, eq(applications.id, applicationStatusHistory.applicationId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(and(eq(applicationStatusHistory.toStage, "submitted"), ...jobClauses))
        .groupBy(applications.jobId, jobs.openedAt),
      ctx.tx
        .select({ userId: memberships.userId, name: users.name })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(isNull(memberships.deactivatedAt))
        .orderBy(users.name),
      ctx.tx
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(isNull(companies.deletedAt))
        .orderBy(companies.name)
    ]);

    // --- Follow-up events for the cohorts (what happened after each event)
    const cohortAppIds = [
      ...new Set([...subEvents, ...intEvents, ...offerEvents].map((e) => e.applicationId))
    ];
    const followUps = cohortAppIds.length
      ? await ctx.tx
          .select({
            applicationId: applicationStatusHistory.applicationId,
            toStage: applicationStatusHistory.toStage,
            createdAt: applicationStatusHistory.createdAt
          })
          .from(applicationStatusHistory)
          .where(inArray(applicationStatusHistory.applicationId, cohortAppIds))
      : [];
    const byApp = new Map<string, { toStage: string; createdAt: Date }[]>();
    for (const r of followUps) {
      const list = byApp.get(r.applicationId) ?? [];
      list.push({ toStage: r.toStage, createdAt: r.createdAt });
      byApp.set(r.applicationId, list);
    }

    /** First event per application in a window-event list (one cohort entry per app). */
    const firstPerApp = (events: { applicationId: string; createdAt: Date }[]) => {
      const m = new Map<string, Date>();
      for (const e of events) {
        const prev = m.get(e.applicationId);
        if (!prev || e.createdAt < prev) m.set(e.applicationId, e.createdAt);
      }
      return m;
    };
    const reached = (cohort: Map<string, Date>, stages: string[]) => {
      let n = 0;
      for (const [appId, at] of cohort) {
        const later = byApp.get(appId) ?? [];
        if (later.some((l) => stages.includes(l.toStage) && l.createdAt >= at)) n += 1;
      }
      return n;
    };

    const subCohort = firstPerApp(subEvents);
    const intCohort = firstPerApp(intEvents);
    const offerCohort = firstPerApp(offerEvents);

    // --- Client feedback time (decision C): first stage change after a submission.
    const feedbackDays: number[] = [];
    let awaitingFeedback = 0;
    for (const [appId, at] of subCohort) {
      const later = (byApp.get(appId) ?? [])
        .filter((l) => l.createdAt > at)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      if (later.length === 0) {
        awaitingFeedback += 1;
        continue;
      }
      feedbackDays.push((later[0]!.createdAt.getTime() - at.getTime()) / DAY_MS);
    }

    // --- Job-level metrics
    const filled = closedJobs.filter((j) => j.status === "filled");
    const decided = closedJobs.filter((j) =>
      ["filled", "cancelled", "declined"].includes(j.status)
    );
    const timeToFillDays = filled
      .filter((j) => j.closedAt)
      .map((j) => (j.closedAt!.getTime() - j.openedAt.getTime()) / DAY_MS);
    const openingToFirstSubDays = firstSubmissions
      .map((r) => ({ first: new Date(r.first), openedAt: r.openedAt }))
      .filter((r) => r.first >= from && r.first <= to)
      .map((r) => Math.max(0, (r.first.getTime() - r.openedAt.getTime()) / DAY_MS));

    return {
      counts: {
        submissions: subCohort.size,
        interviews: intCohort.size,
        offers: offerCohort.size,
        placements: firstPerApp(hireEvents).size
      },
      /** Submission cohort followed stage by stage - drives the funnel chart. */
      funnel: {
        submitted: subCohort.size,
        interview: reached(subCohort, ["interview", "offered", "hired"]),
        offered: reached(subCohort, ["offered", "hired"]),
        hired: reached(subCohort, ["hired"])
      },
      conversion: {
        submissionToInterview: {
          cohort: subCohort.size,
          reached: reached(subCohort, ["interview", "offered", "hired"])
        },
        interviewToOffer: {
          cohort: intCohort.size,
          reached: reached(intCohort, ["offered", "hired"])
        },
        offerToAcceptance: { cohort: offerCohort.size, reached: reached(offerCohort, ["hired"]) },
        fillRate: { filled: filled.length, decided: decided.length }
      },
      time: {
        openingToFirstSubmission: avg(openingToFirstSubDays),
        openingToFirstSubmissionSample: openingToFirstSubDays.length,
        timeToFill: avg(timeToFillDays),
        timeToFillSample: timeToFillDays.length,
        clientFeedback: avg(feedbackDays),
        clientFeedbackSample: feedbackDays.length,
        awaitingFeedback
      },
      filters: { members, clients }
    };
  })
});
