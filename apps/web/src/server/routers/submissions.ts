import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  applications,
  candidates,
  jobs,
  submissionMedium,
  submissions,
  users,
  type Transaction
} from "@emerge/db";
import { writeAudit } from "../audit";
import { bumpCounter, humanId } from "../counters";
import { router, workspaceProcedure } from "../trpc";
import { ensureStatuses, makeShareToken, newBatchId, setApplicationStatus } from "../submissions";

const listCols = {
  id: submissions.id,
  humanId: submissions.humanId,
  batchId: submissions.batchId,
  applicationId: submissions.applicationId,
  jobId: submissions.jobId,
  companyId: submissions.companyId,
  status: submissions.status,
  medium: submissions.medium,
  sentAt: submissions.sentAt,
  verdictAt: submissions.verdictAt,
  clientComment: submissions.clientComment,
  expiresAt: submissions.expiresAt,
  candidateId: applications.candidateId,
  candidateFirstName: candidates.firstName,
  candidateLastName: candidates.lastName,
  jobTitle: jobs.title,
  jobHumanId: jobs.humanId,
  sentByName: users.name
};

function baseQuery(tx: Transaction) {
  return tx
    .select(listCols)
    .from(submissions)
    .innerJoin(applications, eq(applications.id, submissions.applicationId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, submissions.jobId))
    .leftJoin(users, eq(users.id, submissions.sentById));
}

export const submissionsRouter = router({
  /** Send one or more of a job's applications to the client under one link. */
  create: workspaceProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        applicationIds: z.array(z.string().uuid()).min(1).max(50),
        contactId: z.string().uuid().nullable().optional(),
        medium: z.enum(submissionMedium.enumValues).default("link"),
        note: z.string().trim().max(2000).nullable().optional(),
        expiresInDays: z.number().int().min(1).max(90).nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureStatuses(ctx.tx, ctx.workspaceId);
      const [job] = await ctx.tx
        .select({ id: jobs.id, companyId: jobs.companyId })
        .from(jobs)
        .where(and(eq(jobs.id, input.jobId), isNull(jobs.deletedAt)));
      if (!job) throw new TRPCError({ code: "BAD_REQUEST", message: "Job not found" });

      const apps = await ctx.tx
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(
            inArray(applications.id, input.applicationIds),
            eq(applications.jobId, input.jobId),
            isNull(applications.deletedAt)
          )
        );
      if (apps.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No valid applications for this job" });
      }

      const { token, tokenHash } = makeShareToken();
      const batchId = newBatchId();
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;
      const top = await bumpCounter(ctx.tx, ctx.workspaceId, "submission", apps.length);
      const base = top - apps.length;

      const created = await ctx.tx
        .insert(submissions)
        .values(
          apps.map((a, i) => ({
            workspaceId: ctx.workspaceId,
            humanId: humanId("SUB", base + i + 1),
            batchId,
            applicationId: a.id,
            jobId: input.jobId,
            companyId: job.companyId,
            contactId: input.contactId ?? null,
            medium: input.medium,
            tokenHash,
            sentById: ctx.session.user.id,
            expiresAt,
            note: input.note ?? null
          }))
        )
        .returning({ id: submissions.id });

      for (const a of apps) {
        await setApplicationStatus(ctx.tx, {
          workspaceId: ctx.workspaceId,
          applicationId: a.id,
          statusKey: "submitted_to_client",
          actorUserId: ctx.session.user.id,
          note: "Submitted to client"
        });
      }

      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "submission.created",
        targetType: "job",
        targetId: input.jobId,
        meta: { batchId, count: created.length }
      });

      // Raw token returned once so the client can build the share URL.
      return { token, batchId, count: created.length };
    }),

  byJob: workspaceProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return baseQuery(ctx.tx)
        .where(eq(submissions.jobId, input.jobId))
        .orderBy(desc(submissions.sentAt));
    }),

  byClient: workspaceProcedure
    .input(z.object({ companyId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return baseQuery(ctx.tx)
        .where(eq(submissions.companyId, input.companyId))
        .orderBy(desc(submissions.sentAt));
    }),

  /** Submissions for one application (verdict banner on the application record). */
  forApplication: workspaceProcedure
    .input(z.object({ applicationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return baseQuery(ctx.tx)
        .where(eq(submissions.applicationId, input.applicationId))
        .orderBy(desc(submissions.sentAt));
    }),

  /** Revoke a live share link (its whole batch): archive + kill the token. */
  revoke: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .select({ batchId: submissions.batchId })
        .from(submissions)
        .where(eq(submissions.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
      await ctx.tx
        .update(submissions)
        .set({ status: "archived", expiresAt: new Date() })
        .where(and(eq(submissions.batchId, row.batchId), eq(submissions.status, "submitted")));
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "submission.revoked",
        targetType: "submission",
        targetId: input.id,
        meta: { batchId: row.batchId }
      });
      return { ok: true };
    })
});
