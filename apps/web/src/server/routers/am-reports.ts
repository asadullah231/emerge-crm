import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { candidates, companies, jobs, memberships, notes, placements, users } from "@emerge/db";
import { router, workspaceProcedure } from "../trpc";

const windowInput = z.object({ from: z.date(), to: z.date() });

/**
 * RD-2 (Reporting Dashboard): account-manager view. Clients and jobs are
 * attributed to their owner (the AM); meetings to the note author; placements
 * to the owning AM of the placed job. All counts follow the event date
 * (client created, job opened, terms signed, placement recorded).
 */
export const amReportsRouter = router({
  overview: workspaceProcedure.input(windowInput).query(async ({ ctx, input }) => {
    const { from, to } = input;

    const [members, newClients, newJobs, termsSigned, meetingRows, placementRows] =
      await Promise.all([
        ctx.tx
          .select({ userId: memberships.userId, name: users.name, role: memberships.role })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(isNull(memberships.deactivatedAt))
          .orderBy(users.name),
        ctx.tx
          .select({
            id: companies.id,
            name: companies.name,
            source: companies.source,
            createdAt: companies.createdAt,
            ownerId: companies.ownerId
          })
          .from(companies)
          .where(
            and(
              isNull(companies.deletedAt),
              gte(companies.createdAt, from),
              lte(companies.createdAt, to)
            )
          ),
        ctx.tx
          .select({
            id: jobs.id,
            title: jobs.title,
            openedAt: jobs.openedAt,
            ownerId: jobs.ownerId,
            companyName: companies.name
          })
          .from(jobs)
          .innerJoin(companies, eq(companies.id, jobs.companyId))
          .where(and(isNull(jobs.deletedAt), gte(jobs.openedAt, from), lte(jobs.openedAt, to))),
        ctx.tx
          .select({
            id: companies.id,
            name: companies.name,
            termsSignedAt: companies.termsSignedAt,
            ownerId: companies.ownerId
          })
          .from(companies)
          .where(
            and(
              isNull(companies.deletedAt),
              gte(companies.termsSignedAt, from),
              lte(companies.termsSignedAt, to)
            )
          ),
        ctx.tx
          .select({ authorId: notes.authorId, createdAt: notes.createdAt })
          .from(notes)
          .where(
            and(
              isNull(notes.deletedAt),
              eq(notes.kind, "meeting"),
              gte(notes.createdAt, from),
              lte(notes.createdAt, to)
            )
          ),
        ctx.tx
          .select({
            id: placements.id,
            createdAt: placements.createdAt,
            feeAmount: placements.feeAmount,
            currency: placements.currency,
            amId: jobs.ownerId,
            jobId: jobs.id,
            jobTitle: jobs.title,
            companyName: companies.name,
            candidateFirstName: candidates.firstName,
            candidateLastName: candidates.lastName
          })
          .from(placements)
          .innerJoin(jobs, eq(jobs.id, placements.jobId))
          .innerJoin(companies, eq(companies.id, jobs.companyId))
          .innerJoin(candidates, eq(candidates.id, placements.candidateId))
          .where(and(gte(placements.createdAt, from), lte(placements.createdAt, to)))
      ]);

    return { members, newClients, newJobs, termsSigned, meetingRows, placementRows };
  })
});
