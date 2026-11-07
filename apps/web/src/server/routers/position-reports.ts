import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  applicationStatusHistory,
  applications,
  companies,
  jobRecruiters,
  jobs,
  notes,
  placements,
  users
} from "@emerge/db";
import { router, workspaceProcedure } from "../trpc";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * RD-3 (Reporting Dashboard): position tracker. One row per live (open) job:
 * how long it has been live, how much pipeline it has (distinct candidates
 * that ever reached each stage), when the client last got a submission and
 * when anything last happened. Red flags are computed client-side from
 * daysLive / daysSinceLastSubmission / placements.
 */
export const positionReportsRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    const openJobs = await ctx.tx
      .select({
        id: jobs.id,
        title: jobs.title,
        openedAt: jobs.openedAt,
        positions: jobs.positions,
        ownerId: jobs.ownerId,
        ownerName: users.name,
        companyName: companies.name
      })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .leftJoin(users, eq(users.id, jobs.ownerId))
      .where(and(eq(jobs.status, "open"), isNull(jobs.deletedAt)));

    const jobIds = openJobs.map((j) => j.id);
    if (jobIds.length === 0) return [];

    const [stageCounts, lastEvents, lastSubmissions, jobNotes, recRows, placementCounts] =
      await Promise.all([
        ctx.tx
          .select({
            jobId: applications.jobId,
            toStage: applicationStatusHistory.toStage,
            n: sql<number>`count(distinct ${applicationStatusHistory.applicationId})::int`
          })
          .from(applicationStatusHistory)
          .innerJoin(applications, eq(applications.id, applicationStatusHistory.applicationId))
          .where(inArray(applications.jobId, jobIds))
          .groupBy(applications.jobId, applicationStatusHistory.toStage),
        ctx.tx
          .select({
            jobId: applications.jobId,
            last: sql<string>`max(${applicationStatusHistory.createdAt})`
          })
          .from(applicationStatusHistory)
          .innerJoin(applications, eq(applications.id, applicationStatusHistory.applicationId))
          .where(inArray(applications.jobId, jobIds))
          .groupBy(applications.jobId),
        ctx.tx
          .select({
            jobId: applications.jobId,
            last: sql<string>`max(${applicationStatusHistory.createdAt})`
          })
          .from(applicationStatusHistory)
          .innerJoin(applications, eq(applications.id, applicationStatusHistory.applicationId))
          .where(
            and(
              inArray(applications.jobId, jobIds),
              eq(applicationStatusHistory.toStage, "submitted")
            )
          )
          .groupBy(applications.jobId),
        ctx.tx
          .select({ jobId: notes.entityId, last: sql<string>`max(${notes.createdAt})` })
          .from(notes)
          .where(
            and(
              eq(notes.entityType, "job"),
              isNull(notes.deletedAt),
              inArray(notes.entityId, jobIds)
            )
          )
          .groupBy(notes.entityId),
        ctx.tx
          .select({ jobId: jobRecruiters.jobId, name: users.name })
          .from(jobRecruiters)
          .innerJoin(users, eq(users.id, jobRecruiters.userId))
          .where(inArray(jobRecruiters.jobId, jobIds)),
        ctx.tx
          .select({ jobId: placements.jobId, n: sql<number>`count(*)::int` })
          .from(placements)
          .where(inArray(placements.jobId, jobIds))
          .groupBy(placements.jobId)
      ]);

    const countsByJob = new Map<string, Record<string, number>>();
    for (const r of stageCounts) {
      const m = countsByJob.get(r.jobId) ?? {};
      m[r.toStage] = r.n;
      countsByJob.set(r.jobId, m);
    }
    const lastEventByJob = new Map(lastEvents.map((r) => [r.jobId, new Date(r.last)]));
    const lastSubmissionByJob = new Map(lastSubmissions.map((r) => [r.jobId, new Date(r.last)]));
    const lastNoteByJob = new Map(jobNotes.map((r) => [r.jobId, new Date(r.last)]));
    const placementsByJob = new Map(placementCounts.map((r) => [r.jobId, r.n]));
    const recruitersByJob = new Map<string, string[]>();
    for (const r of recRows) {
      const list = recruitersByJob.get(r.jobId) ?? [];
      list.push(r.name);
      recruitersByJob.set(r.jobId, list);
    }

    const now = Date.now();
    const days = (d: Date | undefined) => (d ? Math.floor((now - d.getTime()) / DAY_MS) : null);

    return openJobs
      .map((j) => {
        const counts = countsByJob.get(j.id) ?? {};
        const lastSubmission = lastSubmissionByJob.get(j.id);
        const lastEvent = lastEventByJob.get(j.id);
        const lastNote = lastNoteByJob.get(j.id);
        const lastActivity =
          lastEvent && lastNote
            ? lastEvent > lastNote
              ? lastEvent
              : lastNote
            : (lastEvent ?? lastNote);
        return {
          id: j.id,
          title: j.title,
          companyName: j.companyName,
          ownerId: j.ownerId,
          ownerName: j.ownerName,
          recruiters: recruitersByJob.get(j.id) ?? [],
          positions: j.positions,
          daysLive: Math.floor((now - j.openedAt.getTime()) / DAY_MS),
          shortlisted: counts.shortlisted ?? 0,
          submitted: counts.submitted ?? 0,
          rejected: counts.rejected ?? 0,
          interviews: counts.interview ?? 0,
          offers: counts.offered ?? 0,
          placements: placementsByJob.get(j.id) ?? 0,
          daysSinceLastSubmission: days(lastSubmission),
          lastActivityAt: lastActivity ?? null
        };
      })
      .sort((a, b) => b.daysLive - a.daysLive);
  })
});
