import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, isNull, isNotNull } from "drizzle-orm";
import { z } from "zod";
import {
  applicationStage,
  applicationStatusHistory,
  applicationStatuses,
  applications,
  attachments,
  candidates,
  emails,
  interviews,
  jobs,
  notes,
  submissions,
  tasks,
  users,
  type Transaction
} from "@emerge/db";
import {
  APPLICATION_STAGES,
  DEFAULT_APPLICATION_STATUSES,
  defaultEntryStatus
} from "@/lib/applications";
import { writeAudit } from "../audit";
import { humanId, nextCounter } from "../counters";
import { trashCutoff } from "../list-query";
import { sendMentionEmails } from "../mention-emails";
import { router, workspaceProcedure } from "../trpc";
import { fanOutMentions } from "./notes";

const candidateCols = {
  candidateHumanId: candidates.humanId,
  candidateFirstName: candidates.firstName,
  candidateLastName: candidates.lastName,
  candidateTitle: candidates.title
};
const jobCols = { jobTitle: jobs.title, jobHumanId: jobs.humanId };
const ownerCols = { ownerName: users.name };

/** Seed the workspace status dictionary with the defaults if it has none yet. */
export async function ensureDefaultStatuses(tx: Transaction, workspaceId: string): Promise<void> {
  await tx
    .insert(applicationStatuses)
    .values(
      DEFAULT_APPLICATION_STATUSES.map((s) => ({
        workspaceId,
        key: s.key,
        label: s.label,
        stage: s.stage,
        sortOrder: s.sortOrder,
        isEntry: s.isEntry,
        isTerminal: s.isTerminal
      }))
    )
    .onConflictDoNothing({
      target: [applicationStatuses.workspaceId, applicationStatuses.key]
    });
}

/** Resolve a status key to its dictionary row for this workspace. */
async function resolveStatus(tx: Transaction, statusKey: string) {
  const [row] = await tx
    .select()
    .from(applicationStatuses)
    .where(eq(applicationStatuses.key, statusKey));
  if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown status: ${statusKey}` });
  return row;
}

/** The entry status key for a stage (from the workspace dictionary, else default). */
export async function entryStatusForStage(tx: Transaction, stage: string): Promise<string> {
  const [row] = await tx
    .select({ key: applicationStatuses.key })
    .from(applicationStatuses)
    .where(
      and(
        eq(applicationStatuses.stage, stage as (typeof applicationStage.enumValues)[number]),
        eq(applicationStatuses.isEntry, true)
      )
    )
    .limit(1);
  return row?.key ?? defaultEntryStatus(stage as (typeof APPLICATION_STAGES)[number]);
}

const stageEnum = z.enum(applicationStage.enumValues);

/**
 * Rejection reason is required when transitioning INTO the rejected stage,
 * and forbidden otherwise (M16). Keeps the field trimmed + capped.
 */
function coerceRejectionReason(
  toStage: (typeof applicationStage.enumValues)[number],
  provided: string | null | undefined
): string | null {
  const trimmed = provided?.trim() || null;
  if (toStage === "rejected") {
    if (!trimmed) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A rejection reason is required when rejecting an application"
      });
    }
    return trimmed;
  }
  if (trimmed) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A rejection reason only applies when rejecting"
    });
  }
  return null;
}

/**
 * Compose the short status-history `note` line so the timeline entry reads
 * naturally — includes the rejection reason (when rejecting) and, optionally,
 * the recruiter's comment.
 */
function composeTransitionNote(
  rejectionReason: string | null,
  noteBody: string | null | undefined
): string | null {
  const trimmed = noteBody?.trim() || null;
  if (rejectionReason && trimmed) return `Rejected — ${rejectionReason}\n${trimmed}`;
  if (rejectionReason) return `Rejected — ${rejectionReason}`;
  return trimmed;
}

/**
 * Persist an optional inline comment as a first-class note on the application
 * (so it appears in the Notes panel and can be edited/deleted), fan out any
 * @mentions and email them (M16). Failures on email enqueue don't roll back
 * the enclosing status change.
 */
async function attachTransitionNote(
  tx: Transaction,
  opts: {
    workspaceId: string;
    applicationId: string;
    authorId: string;
    authorName: string;
    body: string;
    mentionUserIds: string[];
  }
): Promise<void> {
  const [note] = await tx
    .insert(notes)
    .values({
      workspaceId: opts.workspaceId,
      entityType: "application",
      entityId: opts.applicationId,
      authorId: opts.authorId,
      body: opts.body
    })
    .returning();
  if (!note) return;
  const notified = await fanOutMentions(tx, {
    workspaceId: opts.workspaceId,
    noteId: note.id,
    entityType: "application",
    entityId: opts.applicationId,
    authorId: opts.authorId,
    mentionUserIds: opts.mentionUserIds
  });
  if (notified.length > 0) {
    try {
      await sendMentionEmails(tx, {
        authorName: opts.authorName,
        entityType: "application",
        entityId: opts.applicationId,
        noteBody: opts.body,
        recipientIds: notified
      });
    } catch (err) {
      console.error("[applications.stage-change] mention email enqueue failed:", err);
    }
  }
}

export const applicationsRouter = router({
  /** The workspace status dictionary (seeded on demand), for pickers. */
  statuses: workspaceProcedure.query(async ({ ctx }) => {
    await ensureDefaultStatuses(ctx.tx, ctx.workspaceId);
    return ctx.tx.select().from(applicationStatuses).orderBy(asc(applicationStatuses.sortOrder));
  }),

  /** Kanban board grouped by stage, optionally scoped to one job. */
  board: workspaceProcedure
    .input(z.object({ jobId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      await ensureDefaultStatuses(ctx.tx, ctx.workspaceId);
      const where = and(
        isNull(applications.deletedAt),
        input.jobId ? eq(applications.jobId, input.jobId) : undefined
      );
      const [rows, statuses] = await Promise.all([
        ctx.tx
          .select({
            id: applications.id,
            humanId: applications.humanId,
            stage: applications.stage,
            statusKey: applications.statusKey,
            rating: applications.rating,
            stageEnteredAt: applications.stageEnteredAt,
            candidateId: applications.candidateId,
            jobId: applications.jobId,
            ownerId: applications.ownerId,
            ...candidateCols,
            ...jobCols,
            ...ownerCols
          })
          .from(applications)
          .innerJoin(candidates, eq(candidates.id, applications.candidateId))
          .innerJoin(jobs, eq(jobs.id, applications.jobId))
          .leftJoin(users, eq(users.id, applications.ownerId))
          .where(where)
          .orderBy(desc(applications.stageEnteredAt)),
        ctx.tx.select().from(applicationStatuses).orderBy(asc(applicationStatuses.sortOrder))
      ]);

      const columns: Record<string, typeof rows> = {};
      for (const stage of APPLICATION_STAGES) columns[stage] = [];
      for (const row of rows) (columns[row.stage] ??= []).push(row);
      return { columns, statuses, total: rows.length };
    }),

  /** Paginated table view with job/stage/owner filters. */
  list: workspaceProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(200).default(50),
        jobId: z.string().uuid().optional(),
        candidateId: z.string().uuid().optional(),
        stage: stageEnum.optional(),
        deleted: z.boolean().default(false)
      })
    )
    .query(async ({ ctx, input }) => {
      const deletedWhere = input.deleted
        ? and(isNotNull(applications.deletedAt), gte(applications.deletedAt, trashCutoff()))
        : isNull(applications.deletedAt);
      const where = and(
        deletedWhere,
        input.jobId ? eq(applications.jobId, input.jobId) : undefined,
        input.candidateId ? eq(applications.candidateId, input.candidateId) : undefined,
        input.stage ? eq(applications.stage, input.stage) : undefined
      );
      const [rows, [totalRow]] = await Promise.all([
        ctx.tx
          .select({
            id: applications.id,
            humanId: applications.humanId,
            stage: applications.stage,
            statusKey: applications.statusKey,
            rating: applications.rating,
            stageEnteredAt: applications.stageEnteredAt,
            candidateId: applications.candidateId,
            jobId: applications.jobId,
            deletedAt: applications.deletedAt,
            ...candidateCols,
            ...jobCols,
            ...ownerCols
          })
          .from(applications)
          .innerJoin(candidates, eq(candidates.id, applications.candidateId))
          .innerJoin(jobs, eq(jobs.id, applications.jobId))
          .leftJoin(users, eq(users.id, applications.ownerId))
          .where(where)
          .orderBy(desc(applications.stageEnteredAt), asc(applications.id))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        ctx.tx.select({ total: count() }).from(applications).where(where)
      ]);
      return { rows, total: totalRow?.total ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [app] = await ctx.tx
        .select({
          id: applications.id,
          humanId: applications.humanId,
          stage: applications.stage,
          statusKey: applications.statusKey,
          rejectionReason: applications.rejectionReason,
          rating: applications.rating,
          source: applications.source,
          ownerId: applications.ownerId,
          stageEnteredAt: applications.stageEnteredAt,
          candidateId: applications.candidateId,
          jobId: applications.jobId,
          deletedAt: applications.deletedAt,
          createdAt: applications.createdAt,
          updatedAt: applications.updatedAt,
          ...candidateCols,
          ...jobCols,
          ...ownerCols
        })
        .from(applications)
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .leftJoin(users, eq(users.id, applications.ownerId))
        .where(eq(applications.id, input.id));
      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });

      const history = await ctx.tx
        .select({
          id: applicationStatusHistory.id,
          fromStatusKey: applicationStatusHistory.fromStatusKey,
          toStatusKey: applicationStatusHistory.toStatusKey,
          fromStage: applicationStatusHistory.fromStage,
          toStage: applicationStatusHistory.toStage,
          note: applicationStatusHistory.note,
          createdAt: applicationStatusHistory.createdAt,
          actorName: users.name
        })
        .from(applicationStatusHistory)
        .leftJoin(users, eq(users.id, applicationStatusHistory.actorUserId))
        .where(eq(applicationStatusHistory.applicationId, app.id))
        .orderBy(desc(applicationStatusHistory.createdAt));
      return { ...app, history };
    }),

  /**
   * Related-list counts for the Hiring Pipeline tab sidebar (M17c). One round
   * trip for all six lists; candidate-level attachments are counted separately
   * from application ones because documents live on the candidate record.
   */
  relatedCounts: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [app] = await ctx.tx
        .select({ id: applications.id, candidateId: applications.candidateId })
        .from(applications)
        .where(eq(applications.id, input.id));
      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });

      const one = async (q: Promise<{ total: number }[]>) => (await q)[0]?.total ?? 0;
      const [noteCount, docCount, interviewCount, submissionCount, taskCount, emailCount] =
        await Promise.all([
          one(
            ctx.tx
              .select({ total: count() })
              .from(notes)
              .where(
                and(
                  eq(notes.entityType, "application"),
                  eq(notes.entityId, app.id),
                  isNull(notes.deletedAt)
                )
              )
          ),
          one(
            ctx.tx
              .select({ total: count() })
              .from(attachments)
              .where(
                and(
                  eq(attachments.entityType, "candidate"),
                  eq(attachments.entityId, app.candidateId),
                  isNull(attachments.deletedAt)
                )
              )
          ),
          one(
            ctx.tx
              .select({ total: count() })
              .from(interviews)
              .where(eq(interviews.applicationId, app.id))
          ),
          one(
            ctx.tx
              .select({ total: count() })
              .from(submissions)
              .where(eq(submissions.applicationId, app.id))
          ),
          one(
            ctx.tx
              .select({ total: count() })
              .from(tasks)
              .where(and(eq(tasks.entityType, "application"), eq(tasks.entityId, app.id)))
          ),
          one(
            ctx.tx
              .select({ total: count() })
              .from(emails)
              .where(and(eq(emails.entityType, "application"), eq(emails.entityId, app.id)))
          )
        ]);
      return {
        notes: noteCount,
        documents: docCount,
        interviews: interviewCount,
        submissions: submissionCount,
        tasks: taskCount,
        emails: emailCount
      };
    }),

  /** Associate a candidate to a job (unique pair). Restores a trashed pair. */
  create: workspaceProcedure
    .input(
      z.object({
        candidateId: z.string().uuid(),
        jobId: z.string().uuid(),
        ownerId: z.string().uuid().nullable().optional(),
        source: z.string().trim().max(60).nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureDefaultStatuses(ctx.tx, ctx.workspaceId);
      const [candidate] = await ctx.tx
        .select({ id: candidates.id })
        .from(candidates)
        .where(and(eq(candidates.id, input.candidateId), isNull(candidates.deletedAt)));
      if (!candidate) throw new TRPCError({ code: "BAD_REQUEST", message: "Candidate not found" });
      const [job] = await ctx.tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.id, input.jobId), isNull(jobs.deletedAt)));
      if (!job) throw new TRPCError({ code: "BAD_REQUEST", message: "Job not found" });

      // The (candidate, job) pair is unique even across the trash.
      const [existing] = await ctx.tx
        .select({ id: applications.id, deletedAt: applications.deletedAt })
        .from(applications)
        .where(
          and(eq(applications.candidateId, input.candidateId), eq(applications.jobId, input.jobId))
        );
      const entryStatus = await entryStatusForStage(ctx.tx, "screening");

      if (existing) {
        if (!existing.deletedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This candidate is already on this job's pipeline"
          });
        }
        const [restored] = await ctx.tx
          .update(applications)
          .set({
            deletedAt: null,
            stage: "screening",
            statusKey: entryStatus,
            rejectionReason: null,
            stageEnteredAt: new Date()
          })
          .where(eq(applications.id, existing.id))
          .returning();
        await ctx.tx.insert(applicationStatusHistory).values({
          workspaceId: ctx.workspaceId,
          applicationId: existing.id,
          toStatusKey: entryStatus,
          toStage: "screening",
          actorUserId: ctx.session.user.id,
          note: "Re-associated"
        });
        return restored;
      }

      const next = await nextCounter(ctx.tx, ctx.workspaceId, "application");
      const [created] = await ctx.tx
        .insert(applications)
        .values({
          workspaceId: ctx.workspaceId,
          humanId: humanId("APP", next),
          candidateId: input.candidateId,
          jobId: input.jobId,
          stage: "screening",
          statusKey: entryStatus,
          ownerId: input.ownerId ?? ctx.session.user.id,
          source: input.source ?? null,
          stageEnteredAt: new Date()
        })
        .returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await ctx.tx.insert(applicationStatusHistory).values({
        workspaceId: ctx.workspaceId,
        applicationId: created.id,
        toStatusKey: entryStatus,
        toStage: "screening",
        actorUserId: ctx.session.user.id
      });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "application.created",
        targetType: "application",
        targetId: created.id,
        meta: { humanId: created.humanId }
      });
      return created;
    }),

  /**
   * Change the fine status; the stage follows the status's stage.
   *
   * M16 additions (all optional except when rejecting): `noteBody` becomes a
   * first-class note on the application; `mentionUserIds` fan out to the bell
   * AND email; `rejectionReason` is REQUIRED when the target stage is
   * `rejected` and forbidden otherwise. All in one transaction.
   */
  changeStatus: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        statusKey: z.string().min(1),
        rejectionReason: z.string().trim().max(2000).nullable().optional(),
        noteBody: z.string().trim().max(10000).nullable().optional(),
        mentionUserIds: z.array(z.string().uuid()).max(50).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureDefaultStatuses(ctx.tx, ctx.workspaceId);
      const target = await resolveStatus(ctx.tx, input.statusKey);
      const [current] = await ctx.tx
        .select()
        .from(applications)
        .where(and(eq(applications.id, input.id), isNull(applications.deletedAt)));
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });

      const stageChanged = current.stage !== target.stage;
      const rejectionReason = stageChanged
        ? coerceRejectionReason(target.stage, input.rejectionReason)
        : current.rejectionReason;

      const [updated] = await ctx.tx
        .update(applications)
        .set({
          statusKey: target.key,
          stage: target.stage,
          rejectionReason,
          stageEnteredAt: stageChanged ? new Date() : current.stageEnteredAt
        })
        .where(eq(applications.id, input.id))
        .returning();
      await ctx.tx.insert(applicationStatusHistory).values({
        workspaceId: ctx.workspaceId,
        applicationId: input.id,
        fromStatusKey: current.statusKey,
        toStatusKey: target.key,
        fromStage: current.stage,
        toStage: target.stage,
        actorUserId: ctx.session.user.id,
        note: composeTransitionNote(rejectionReason, input.noteBody)
      });

      if (input.noteBody?.trim()) {
        await attachTransitionNote(ctx.tx, {
          workspaceId: ctx.workspaceId,
          applicationId: input.id,
          authorId: ctx.session.user.id,
          authorName: ctx.session.user.name,
          body: input.noteBody.trim(),
          mentionUserIds: input.mentionUserIds ?? []
        });
      }

      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "application.status_changed",
        targetType: "application",
        targetId: input.id,
        meta: { from: current.statusKey, to: target.key }
      });
      return updated;
    }),

  /**
   * Kanban move: set the stage and snap to that stage's entry status. Same M16
   * shape as changeStatus (noteBody + mentionUserIds + rejectionReason with
   * the reject-only invariant), so both surfaces behave identically.
   */
  changeStage: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        stage: stageEnum,
        rejectionReason: z.string().trim().max(2000).nullable().optional(),
        noteBody: z.string().trim().max(10000).nullable().optional(),
        mentionUserIds: z.array(z.string().uuid()).max(50).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureDefaultStatuses(ctx.tx, ctx.workspaceId);
      const [current] = await ctx.tx
        .select()
        .from(applications)
        .where(and(eq(applications.id, input.id), isNull(applications.deletedAt)));
      if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
      if (current.stage === input.stage) return current;

      const rejectionReason = coerceRejectionReason(input.stage, input.rejectionReason);
      const entryStatus = await entryStatusForStage(ctx.tx, input.stage);
      const [updated] = await ctx.tx
        .update(applications)
        .set({
          stage: input.stage,
          statusKey: entryStatus,
          rejectionReason,
          stageEnteredAt: new Date()
        })
        .where(eq(applications.id, input.id))
        .returning();
      await ctx.tx.insert(applicationStatusHistory).values({
        workspaceId: ctx.workspaceId,
        applicationId: input.id,
        fromStatusKey: current.statusKey,
        toStatusKey: entryStatus,
        fromStage: current.stage,
        toStage: input.stage,
        actorUserId: ctx.session.user.id,
        note: composeTransitionNote(rejectionReason, input.noteBody)
      });

      if (input.noteBody?.trim()) {
        await attachTransitionNote(ctx.tx, {
          workspaceId: ctx.workspaceId,
          applicationId: input.id,
          authorId: ctx.session.user.id,
          authorName: ctx.session.user.name,
          body: input.noteBody.trim(),
          mentionUserIds: input.mentionUserIds ?? []
        });
      }

      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "application.stage_changed",
        targetType: "application",
        targetId: input.id,
        meta: { from: current.stage, to: input.stage }
      });
      return updated;
    }),

  /** Update non-pipeline fields (owner, rating, source). */
  updateMeta: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        patch: z.object({
          ownerId: z.string().uuid().nullable().optional(),
          rating: z.number().int().min(1).max(5).nullable().optional(),
          source: z.string().trim().max(60).nullable().optional()
        })
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.tx
        .update(applications)
        .set({ ...input.patch })
        .where(and(eq(applications.id, input.id), isNull(applications.deletedAt)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "application.updated",
        targetType: "application",
        targetId: updated.id,
        meta: { fields: Object.keys(input.patch) }
      });
      return updated;
    }),

  softDelete: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.tx
        .update(applications)
        .set({ deletedAt: new Date() })
        .where(and(eq(applications.id, input.id), isNull(applications.deletedAt)))
        .returning({ id: applications.id, humanId: applications.humanId });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "application.deleted",
        targetType: "application",
        targetId: deleted.id,
        meta: { humanId: deleted.humanId }
      });
      return deleted;
    }),

  restore: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [restored] = await ctx.tx
        .update(applications)
        .set({ deletedAt: null })
        .where(
          and(
            eq(applications.id, input.id),
            isNotNull(applications.deletedAt),
            gte(applications.deletedAt, trashCutoff())
          )
        )
        .returning({ id: applications.id, humanId: applications.humanId });
      if (!restored) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Application not found in trash" });
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "application.restored",
        targetType: "application",
        targetId: restored.id,
        meta: { humanId: restored.humanId }
      });
      return restored;
    })
});
