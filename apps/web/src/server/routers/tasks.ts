import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { taskStatus, tasks, users } from "@emerge/db";
import { NOTABLE_ENTITY_TYPES } from "@/lib/notes";
import { writeAudit } from "../audit";
import { router, workspaceProcedure } from "../trpc";

const entityLink = z
  .object({
    entityType: z.enum(NOTABLE_ENTITY_TYPES),
    entityId: z.string().uuid()
  })
  .partial();

const cols = {
  id: tasks.id,
  subject: tasks.subject,
  description: tasks.description,
  dueAt: tasks.dueAt,
  status: tasks.status,
  assigneeId: tasks.assigneeId,
  entityType: tasks.entityType,
  entityId: tasks.entityId,
  completedAt: tasks.completedAt,
  createdAt: tasks.createdAt,
  assigneeName: users.name
};

export const tasksRouter = router({
  /** Tasks attached to one record. */
  byEntity: workspaceProcedure
    .input(z.object({ entityType: z.enum(NOTABLE_ENTITY_TYPES), entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select(cols)
        .from(tasks)
        .leftJoin(users, eq(users.id, tasks.assigneeId))
        .where(and(eq(tasks.entityType, input.entityType), eq(tasks.entityId, input.entityId)))
        .orderBy(asc(tasks.status), asc(tasks.dueAt), desc(tasks.createdAt));
    }),

  /** Open tasks assigned to me, overdue/soonest first (My Tasks). */
  mine: workspaceProcedure
    .input(z.object({ includeDone: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select(cols)
        .from(tasks)
        .leftJoin(users, eq(users.id, tasks.assigneeId))
        .where(
          and(
            eq(tasks.assigneeId, ctx.session.user.id),
            input.includeDone ? undefined : ne(tasks.status, "done")
          )
        )
        .orderBy(asc(tasks.dueAt), desc(tasks.createdAt))
        .limit(200);
    }),

  create: workspaceProcedure
    .input(
      z
        .object({
          subject: z.string().trim().min(1, "Subject is required").max(255),
          description: z.string().trim().max(5000).nullable().optional(),
          dueAt: z.date().nullable().optional(),
          assigneeId: z.string().uuid().nullable().optional()
        })
        .merge(entityLink)
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.tx
        .insert(tasks)
        .values({
          workspaceId: ctx.workspaceId,
          subject: input.subject,
          description: input.description ?? null,
          dueAt: input.dueAt ?? null,
          assigneeId: input.assigneeId ?? ctx.session.user.id,
          entityType: input.entityType ?? null,
          entityId: input.entityId ?? null,
          createdById: ctx.session.user.id
        })
        .returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "task.created",
        targetType: input.entityType ?? "task",
        targetId: input.entityId ?? created.id,
        meta: { taskId: created.id, subject: created.subject }
      });
      return created;
    }),

  update: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        patch: z.object({
          subject: z.string().trim().min(1).max(255).optional(),
          description: z.string().trim().max(5000).nullable().optional(),
          dueAt: z.date().nullable().optional(),
          assigneeId: z.string().uuid().nullable().optional(),
          status: z.enum(taskStatus.enumValues).optional()
        })
      })
    )
    .mutation(async ({ ctx, input }) => {
      const set: Record<string, unknown> = { ...input.patch };
      if (input.patch.status !== undefined) {
        set.completedAt = input.patch.status === "done" ? new Date() : null;
      }
      const [updated] = await ctx.tx
        .update(tasks)
        .set(set)
        .where(eq(tasks.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      return updated;
    }),

  /** Shortcut used by the checkbox on task rows. */
  setDone: workspaceProcedure
    .input(z.object({ id: z.string().uuid(), done: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.tx
        .update(tasks)
        .set({
          status: input.done ? "done" : "open",
          completedAt: input.done ? new Date() : null
        })
        .where(eq(tasks.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      return updated;
    }),

  remove: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [removed] = await ctx.tx
        .delete(tasks)
        .where(eq(tasks.id, input.id))
        .returning({ id: tasks.id });
      if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      return removed;
    }),

  /** Open-task counts for a set of records (badges on record headers). */
  countsForEntities: workspaceProcedure
    .input(
      z.object({
        entityType: z.enum(NOTABLE_ENTITY_TYPES),
        entityIds: z.array(z.string().uuid()).max(200)
      })
    )
    .query(async ({ ctx, input }) => {
      if (input.entityIds.length === 0) return {};
      const rows = await ctx.tx
        .select({ entityId: tasks.entityId, status: tasks.status })
        .from(tasks)
        .where(
          and(
            eq(tasks.entityType, input.entityType),
            inArray(tasks.entityId, input.entityIds),
            ne(tasks.status, "done")
          )
        );
      const counts: Record<string, number> = {};
      for (const r of rows) if (r.entityId) counts[r.entityId] = (counts[r.entityId] ?? 0) + 1;
      return counts;
    })
});
