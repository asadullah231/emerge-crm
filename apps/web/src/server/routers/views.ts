import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { savedViews } from "@emerge/db";
import { router, workspaceProcedure } from "../trpc";

const ENTITY = ["candidate", "company", "contact", "job"] as const;

/**
 * Serialized filter state a saved view carries. Kept permissive but bounded:
 * the list page owns interpretation, the router only guarantees the shape.
 */
export const viewFiltersSchema = z
  .object({
    search: z.string().max(200).optional(),
    tagIds: z.array(z.string().uuid()).max(20).optional(),
    sortBy: z.string().max(50).optional(),
    sortDir: z.enum(["asc", "desc"]).optional(),
    /** Structured single-value field filters, e.g. { status: "open" }. */
    fields: z.record(z.string().max(40), z.string().max(80)).optional()
  })
  .strict();

export type ViewFilters = z.infer<typeof viewFiltersSchema>;

export const viewsRouter = router({
  list: workspaceProcedure
    .input(z.object({ entityType: z.enum(ENTITY) }))
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select({
          id: savedViews.id,
          name: savedViews.name,
          filters: savedViews.filters,
          createdById: savedViews.createdById
        })
        .from(savedViews)
        .where(eq(savedViews.entityType, input.entityType))
        .orderBy(asc(savedViews.name));
    }),

  create: workspaceProcedure
    .input(
      z.object({
        entityType: z.enum(ENTITY),
        name: z.string().trim().min(1, "View name is required").max(60),
        filters: viewFiltersSchema
      })
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.tx
        .select({ id: savedViews.id })
        .from(savedViews)
        .where(and(eq(savedViews.entityType, input.entityType), eq(savedViews.name, input.name)));
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: "A view with this name already exists" });
      }
      const [created] = await ctx.tx
        .insert(savedViews)
        .values({
          workspaceId: ctx.workspaceId,
          entityType: input.entityType,
          name: input.name,
          filters: input.filters,
          createdById: ctx.session.user.id
        })
        .returning({ id: savedViews.id, name: savedViews.name, filters: savedViews.filters });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return created;
    }),

  delete: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.tx
        .delete(savedViews)
        .where(eq(savedViews.id, input.id))
        .returning({ id: savedViews.id });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "View not found" });
      return deleted;
    })
});
