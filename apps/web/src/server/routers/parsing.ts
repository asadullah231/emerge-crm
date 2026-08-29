import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { parsedResumeSchema } from "@emerge/core";
import {
  applicationStatusHistory,
  applications,
  attachments,
  candidateEducation,
  candidateExperience,
  candidates,
  jobs,
  notes,
  parseJobs,
  parseJobStatus,
  users
} from "@emerge/db";
import { writeAudit } from "../audit";
import { humanId, nextCounter } from "../counters";
import { enqueueParse } from "../parse-queue";
import { router, workspaceProcedure } from "../trpc";
import { ensureDefaultStatuses, entryStatusForStage } from "./applications";
import { notifyOwnerAssigned } from "./candidates";
import { fanOutMentions } from "./notes";

const statusEnum = z.enum(parseJobStatus.enumValues);

function lower(v: string | null | undefined): string | null {
  return v ? v.toLowerCase() : null;
}

export const parsingRouter = router({
  /** Status -> count, for the review tabs (Needs review / In progress / Done / Failed). */
  counts: workspaceProcedure.query(async ({ ctx }) => {
    const rows = await ctx.tx
      .select({ status: parseJobs.status, n: sql<number>`count(*)::int` })
      .from(parseJobs)
      .groupBy(parseJobs.status);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.status] = r.n;
    return out;
  }),

  list: workspaceProcedure
    .input(
      z.object({
        status: statusEnum.optional(),
        limit: z.number().int().min(1).max(200).default(100)
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select({
          id: parseJobs.id,
          filename: parseJobs.filename,
          status: parseJobs.status,
          mime: parseJobs.mime,
          size: parseJobs.size,
          parsed: parseJobs.parsed,
          candidateId: parseJobs.candidateId,
          error: parseJobs.error,
          createdAt: parseJobs.createdAt,
          updatedAt: parseJobs.updatedAt
        })
        .from(parseJobs)
        .where(input.status ? eq(parseJobs.status, input.status) : undefined)
        .orderBy(desc(parseJobs.createdAt))
        .limit(input.limit);
    }),

  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.tx.select().from(parseJobs).where(eq(parseJobs.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Parse job not found" });
      return row;
    }),

  /**
   * Create a candidate from the reviewed parse result: the candidate + its
   * education/experience sub-records, and the uploaded CV re-linked as a
   * kind=cv attachment. Marks the parse job confirmed. Dedupe is surfaced in the
   * review UI via candidates.duplicates; merging uses candidates.merge.
   *
   * M15 additions, all optional: associate the new candidate with a job
   * opening (creates the application), and leave call notes that @mention the
   * account manager (rides on the M6 notes + notifications machinery).
   */
  confirm: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        candidate: parsedResumeSchema.extend({
          lastName: z.string().trim().min(1, "Last name is required").max(125)
        }),
        ownerId: z.string().uuid().nullable().optional(),
        jobId: z.string().uuid().nullable().optional(),
        notifyUserId: z.string().uuid().nullable().optional(),
        callNotes: z.string().trim().max(10000).nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [pj] = await ctx.tx.select().from(parseJobs).where(eq(parseJobs.id, input.id));
      if (!pj) throw new TRPCError({ code: "NOT_FOUND", message: "Parse job not found" });
      if (pj.status === "confirmed") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already confirmed" });
      }
      const c = input.candidate;

      const next = await nextCounter(ctx.tx, ctx.workspaceId, "candidate");
      const [cand] = await ctx.tx
        .insert(candidates)
        .values({
          workspaceId: ctx.workspaceId,
          humanId: humanId("CAND", next),
          firstName: c.firstName,
          lastName: c.lastName,
          title: c.title,
          currentEmployer: c.currentEmployer,
          email: lower(c.email),
          secondaryEmail: lower(c.secondaryEmail),
          phone: c.phone,
          mobile: c.mobile,
          city: c.city,
          country: c.country,
          linkedinUrl: c.linkedinUrl,
          websiteUrl: c.websiteUrl,
          skills: c.skills,
          experienceYears: c.experienceYears,
          source: "parser",
          ownerId: input.ownerId ?? ctx.session.user.id
        })
        .returning();
      if (!cand) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      if (c.education.length) {
        await ctx.tx.insert(candidateEducation).values(
          c.education.map((e, i) => ({
            workspaceId: ctx.workspaceId,
            candidateId: cand.id,
            institution: e.institution,
            degree: e.degree,
            fieldOfStudy: e.fieldOfStudy,
            startYear: e.startYear,
            endYear: e.endYear,
            sortOrder: i
          }))
        );
      }
      if (c.experience.length) {
        await ctx.tx.insert(candidateExperience).values(
          c.experience.map((e, i) => ({
            workspaceId: ctx.workspaceId,
            candidateId: cand.id,
            company: e.company,
            title: e.title,
            startDate: e.startDate,
            endDate: e.endDate,
            isCurrent: e.isCurrent,
            summary: e.summary,
            sortOrder: i
          }))
        );
      }

      // Re-link the uploaded CV to the new candidate (same S3 object).
      await ctx.tx.insert(attachments).values({
        workspaceId: ctx.workspaceId,
        entityType: "candidate",
        entityId: cand.id,
        kind: "cv",
        bucket: pj.bucket,
        objectKey: pj.objectKey,
        filename: pj.filename,
        mime: pj.mime,
        size: pj.size,
        uploadedById: ctx.session.user.id
      });

      await ctx.tx
        .update(parseJobs)
        .set({
          status: "confirmed",
          candidateId: cand.id,
          confirmedById: ctx.session.user.id,
          updatedAt: new Date()
        })
        .where(eq(parseJobs.id, input.id));

      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "candidate.created",
        targetType: "candidate",
        targetId: cand.id,
        meta: {
          humanId: cand.humanId,
          name: [cand.firstName, cand.lastName].filter(Boolean).join(" "),
          via: "parser"
        }
      });
      await notifyOwnerAssigned(ctx.tx, {
        workspaceId: ctx.workspaceId,
        ownerId: cand.ownerId,
        actorId: ctx.session.user.id,
        ids: [cand.id]
      });

      // Optionally put the new candidate straight on a job's pipeline (M15).
      let applicationId: string | null = null;
      if (input.jobId) {
        const [job] = await ctx.tx
          .select({ id: jobs.id })
          .from(jobs)
          .where(and(eq(jobs.id, input.jobId), isNull(jobs.deletedAt)));
        if (!job) throw new TRPCError({ code: "BAD_REQUEST", message: "Job opening not found" });
        await ensureDefaultStatuses(ctx.tx, ctx.workspaceId);
        const entryStatus = await entryStatusForStage(ctx.tx, "screening");
        const nextApp = await nextCounter(ctx.tx, ctx.workspaceId, "application");
        const [app] = await ctx.tx
          .insert(applications)
          .values({
            workspaceId: ctx.workspaceId,
            humanId: humanId("APP", nextApp),
            candidateId: cand.id,
            jobId: input.jobId,
            stage: "screening",
            statusKey: entryStatus,
            ownerId: input.ownerId ?? ctx.session.user.id,
            source: "parser",
            stageEnteredAt: new Date()
          })
          .returning();
        if (!app) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        await ctx.tx.insert(applicationStatusHistory).values({
          workspaceId: ctx.workspaceId,
          applicationId: app.id,
          toStatusKey: entryStatus,
          toStage: "screening",
          actorUserId: ctx.session.user.id
        });
        await writeAudit({
          workspaceId: ctx.workspaceId,
          actorUserId: ctx.session.user.id,
          action: "application.created",
          targetType: "application",
          targetId: app.id,
          meta: { humanId: app.humanId, via: "parser" }
        });
        applicationId = app.id;
      }

      // Optionally leave call notes that @mention the account manager (M15).
      if (input.callNotes || input.notifyUserId) {
        let mentionName: string | null = null;
        if (input.notifyUserId) {
          const [u] = await ctx.tx
            .select({ name: users.name })
            .from(users)
            .where(eq(users.id, input.notifyUserId));
          mentionName = u?.name ?? null;
        }
        const body = [
          mentionName ? `@${mentionName}` : null,
          input.callNotes?.trim() ||
            (applicationId
              ? "Candidate added to the pipeline from CV parsing."
              : "Candidate created from CV parsing.")
        ]
          .filter(Boolean)
          .join("\n\n");
        const entityType = applicationId ? "application" : "candidate";
        const entityId = applicationId ?? cand.id;
        const [note] = await ctx.tx
          .insert(notes)
          .values({
            workspaceId: ctx.workspaceId,
            entityType,
            entityId,
            authorId: ctx.session.user.id,
            body
          })
          .returning();
        if (note) {
          const notified = await fanOutMentions(ctx.tx, {
            workspaceId: ctx.workspaceId,
            noteId: note.id,
            entityType,
            entityId,
            authorId: ctx.session.user.id,
            mentionUserIds: input.notifyUserId ? [input.notifyUserId] : []
          });
          await writeAudit({
            workspaceId: ctx.workspaceId,
            actorUserId: ctx.session.user.id,
            action: "note.created",
            targetType: entityType,
            targetId: entityId,
            meta: { noteId: note.id, mentioned: notified.length, via: "parser" }
          });
        }
      }

      return { candidateId: cand.id, humanId: cand.humanId, applicationId };
    }),

  /** Re-queue a failed (or stuck) parse for another attempt. */
  retry: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .update(parseJobs)
        .set({ status: "queued", error: null, updatedAt: new Date() })
        .where(
          and(eq(parseJobs.id, input.id), sql`${parseJobs.status} in ('failed','parsed','parsing')`)
        )
        .returning({ id: parseJobs.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Parse job not found" });
      await enqueueParse({ parseJobId: row.id, workspaceId: ctx.workspaceId });
      return { id: row.id };
    }),

  discard: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .update(parseJobs)
        .set({ status: "discarded", updatedAt: new Date() })
        .where(eq(parseJobs.id, input.id))
        .returning({ id: parseJobs.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Parse job not found" });
      return { id: row.id };
    })
});
