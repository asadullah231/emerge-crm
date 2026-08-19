import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { applications, reviewKind, reviews, users } from "@emerge/db";
import { writeAudit } from "../audit";
import { router, workspaceProcedure } from "../trpc";

/**
 * Ratings and Reviews on an application (M17c, Zoho Reviews related list).
 * Anyone with write access can review; authors (or admins) can remove their
 * own review. Interview scorecards stay in interview_feedback.
 */
export const reviewsRouter = router({
  byApplication: workspaceProcedure
    .input(z.object({ applicationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select({
          id: reviews.id,
          kind: reviews.kind,
          rating: reviews.rating,
          comment: reviews.comment,
          reviewerUserId: reviews.reviewerUserId,
          reviewerName: users.name,
          createdAt: reviews.createdAt
        })
        .from(reviews)
        .leftJoin(users, eq(users.id, reviews.reviewerUserId))
        .where(eq(reviews.applicationId, input.applicationId))
        .orderBy(desc(reviews.createdAt));
    }),

  create: workspaceProcedure
    .input(
      z.object({
        applicationId: z.string().uuid(),
        kind: z.enum(reviewKind.enumValues).default("recruiter"),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(5000).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [app] = await ctx.tx
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.id, input.applicationId));
      if (!app) throw new TRPCError({ code: "NOT_FOUND", message: "Application not found" });

      const [created] = await ctx.tx
        .insert(reviews)
        .values({
          workspaceId: ctx.workspaceId,
          applicationId: input.applicationId,
          reviewerUserId: ctx.session.user.id,
          kind: input.kind,
          rating: input.rating,
          comment: input.comment || null
        })
        .returning({ id: reviews.id });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "review.created",
        targetType: "application",
        targetId: input.applicationId,
        meta: { kind: input.kind, rating: input.rating }
      });
      return created;
    }),

  delete: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .select({ id: reviews.id, reviewerUserId: reviews.reviewerUserId })
        .from(reviews)
        .where(eq(reviews.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Review not found" });
      if (row.reviewerUserId !== ctx.session.user.id && ctx.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the reviewer or an admin can delete a review"
        });
      }
      await ctx.tx.delete(reviews).where(and(eq(reviews.id, input.id)));
      return { id: input.id };
    })
});
