import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { taggings, tags, type Transaction } from "@emerge/db";
import { router, workspaceProcedure } from "../trpc";

export const TAGGABLE = ["company", "contact", "candidate", "job"] as const;
export type TaggableType = (typeof TAGGABLE)[number];

/** Tags attached to one record (used by record pages). */
export async function entityTags(tx: Transaction, entityType: TaggableType, entityId: string) {
  return tx
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(taggings)
    .innerJoin(tags, eq(tags.id, taggings.tagId))
    .where(and(eq(taggings.entityType, entityType), eq(taggings.entityId, entityId)))
    .orderBy(asc(tags.name));
}

export const tagsRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    return ctx.tx
      .select({ id: tags.id, name: tags.name, color: tags.color })
      .from(tags)
      .orderBy(asc(tags.name));
  }),

  create: workspaceProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Tag name is required").max(50),
        color: z.string().trim().max(20).nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.tx
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.name, input.name));
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "A tag with this name already exists" });
      }
      const [created] = await ctx.tx
        .insert(tags)
        .values({ workspaceId: ctx.workspaceId, name: input.name, color: input.color ?? null })
        .returning({ id: tags.id, name: tags.name, color: tags.color });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return created;
    }),

  /** Replaces the full tag set of one record. */
  setForEntity: workspaceProcedure
    .input(
      z.object({
        entityType: z.enum(TAGGABLE),
        entityId: z.string().uuid(),
        tagIds: z.array(z.string().uuid()).max(50)
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.tx
        .delete(taggings)
        .where(
          and(eq(taggings.entityType, input.entityType), eq(taggings.entityId, input.entityId))
        );
      if (input.tagIds.length > 0) {
        // Only tags that exist in this workspace (RLS filters the select).
        const valid = await ctx.tx
          .select({ id: tags.id })
          .from(tags)
          .where(inArray(tags.id, input.tagIds));
        if (valid.length > 0) {
          await ctx.tx.insert(taggings).values(
            valid.map((t) => ({
              workspaceId: ctx.workspaceId,
              tagId: t.id,
              entityType: input.entityType,
              entityId: input.entityId
            }))
          );
        }
      }
      return entityTags(ctx.tx, input.entityType, input.entityId);
    })
});
