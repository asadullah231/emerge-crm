import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { candidates, companies, contacts, jobs, taggings, tags, tasks } from "@emerge/db";
import { writeAudit } from "../audit";
import { trashCutoff } from "../list-query";
import { router, workspaceProcedure } from "../trpc";

const BULK_TYPES = ["candidate", "company", "contact", "job"] as const;
type BulkType = (typeof BULK_TYPES)[number];

/**
 * All four bulk-target tables share `id` and `deletedAt` with identical types,
 * so we resolve the concrete table by type and cast to one representative for
 * the shared soft-delete / restore writes.
 */
function tableFor(type: BulkType) {
  switch (type) {
    case "candidate":
      return candidates;
    case "company":
      return companies;
    case "contact":
      return contacts;
    case "job":
      return jobs;
  }
}
type SoftDeletable = typeof candidates;

const bulkIds = z.object({
  type: z.enum(BULK_TYPES),
  ids: z.array(z.string().uuid()).min(1).max(500)
});

/**
 * Cross-object bulk operations for list pages: soft-delete, restore and
 * tag-attach over a selected set. Everything runs inside the workspace RLS tx,
 * so ids from another workspace simply match nothing.
 */
export const bulkRouter = router({
  softDelete: workspaceProcedure.input(bulkIds).mutation(async ({ ctx, input }) => {
    const t = tableFor(input.type) as SoftDeletable;
    const rows = await ctx.tx
      .update(t)
      .set({ deletedAt: new Date() })
      .where(and(inArray(t.id, input.ids), isNull(t.deletedAt)))
      .returning({ id: t.id });
    await writeAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.session.user.id,
      action: `${input.type}.bulk_deleted`,
      targetType: input.type,
      meta: { count: rows.length }
    });
    return { count: rows.length };
  }),

  restore: workspaceProcedure.input(bulkIds).mutation(async ({ ctx, input }) => {
    const t = tableFor(input.type) as SoftDeletable;
    const rows = await ctx.tx
      .update(t)
      .set({ deletedAt: null })
      .where(and(inArray(t.id, input.ids), isNotNull(t.deletedAt), gte(t.deletedAt, trashCutoff())))
      .returning({ id: t.id });
    await writeAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.session.user.id,
      action: `${input.type}.bulk_restored`,
      targetType: input.type,
      meta: { count: rows.length }
    });
    return { count: rows.length };
  }),

  addTag: workspaceProcedure
    .input(bulkIds.extend({ tagId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Tag must belong to this workspace (RLS scopes the select).
      const [tag] = await ctx.tx.select({ id: tags.id }).from(tags).where(eq(tags.id, input.tagId));
      if (!tag) return { added: 0 };
      const before = await ctx.tx
        .select({ id: taggings.id })
        .from(taggings)
        .where(and(eq(taggings.tagId, input.tagId), inArray(taggings.entityId, input.ids)));
      await ctx.tx
        .insert(taggings)
        .values(
          input.ids.map((entityId) => ({
            workspaceId: ctx.workspaceId,
            tagId: input.tagId,
            entityType: input.type,
            entityId
          }))
        )
        .onConflictDoNothing();
      const added = input.ids.length - before.length;
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: `${input.type}.bulk_tagged`,
        targetType: input.type,
        meta: { tagId: input.tagId, added }
      });
      return { added };
    }),

  /** Detach one tag from every selected record (JP-09, Zoho Remove Tags). */
  removeTag: workspaceProcedure
    .input(bulkIds.extend({ tagId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.tx
        .delete(taggings)
        .where(
          and(
            eq(taggings.tagId, input.tagId),
            eq(taggings.entityType, input.type),
            inArray(taggings.entityId, input.ids)
          )
        )
        .returning({ id: taggings.id });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: `${input.type}.bulk_untagged`,
        targetType: input.type,
        meta: { tagId: input.tagId, removed: rows.length }
      });
      return { removed: rows.length };
    }),

  /** One task per selected record (JP-09, Zoho bulk Create Task). */
  createTask: workspaceProcedure
    .input(
      bulkIds.extend({
        subject: z.string().trim().min(1, "Subject is required").max(255),
        dueAt: z.coerce.date().nullable().optional(),
        assigneeId: z.string().uuid().nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Only records that actually exist (and are not trashed) get a task.
      const t = tableFor(input.type) as SoftDeletable;
      const live = await ctx.tx
        .select({ id: t.id })
        .from(t)
        .where(and(inArray(t.id, input.ids), isNull(t.deletedAt)));
      if (live.length === 0) return { created: 0 };
      await ctx.tx.insert(tasks).values(
        live.map((r) => ({
          workspaceId: ctx.workspaceId,
          subject: input.subject,
          dueAt: input.dueAt ?? null,
          assigneeId: input.assigneeId ?? ctx.session.user.id,
          entityType: input.type,
          entityId: r.id,
          createdById: ctx.session.user.id
        }))
      );
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: `${input.type}.bulk_task_created`,
        targetType: input.type,
        meta: { subject: input.subject, count: live.length }
      });
      return { created: live.length };
    })
});
