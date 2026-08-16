import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { feedbackRecommendation, interviewFeedback, interviews, users } from "@emerge/db";
import { writeAudit } from "../audit";
import { router, workspaceProcedure } from "../trpc";

/** Feedback is editable by its author for this long after first submit. */
export const FEEDBACK_EDIT_WINDOW_MS = 15 * 60 * 1000;

export const interviewFeedbackRouter = router({
  /** All feedback for an application's interviews, with a scorecard aggregate. */
  forApplication: workspaceProcedure
    .input(z.object({ applicationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.tx
        .select({
          id: interviewFeedback.id,
          interviewId: interviewFeedback.interviewId,
          rating: interviewFeedback.rating,
          recommendation: interviewFeedback.recommendation,
          comments: interviewFeedback.comments,
          createdAt: interviewFeedback.createdAt,
          authorUserId: interviewFeedback.authorUserId,
          authorName: users.name,
          interviewHumanId: interviews.humanId,
          interviewType: interviews.type
        })
        .from(interviewFeedback)
        .leftJoin(users, eq(users.id, interviewFeedback.authorUserId))
        .leftJoin(interviews, eq(interviews.id, interviewFeedback.interviewId))
        .where(eq(interviewFeedback.applicationId, input.applicationId))
        .orderBy(desc(interviewFeedback.createdAt));

      const count = rows.length;
      const avgRating = count > 0 ? rows.reduce((s, r) => s + r.rating, 0) / count : null;
      const recommendations = rows.reduce<Record<string, number>>((acc, r) => {
        acc[r.recommendation] = (acc[r.recommendation] ?? 0) + 1;
        return acc;
      }, {});
      return { rows, aggregate: { count, avgRating, recommendations } };
    }),

  /** Create or edit the caller's feedback for one interview (15-min window). */
  submit: workspaceProcedure
    .input(
      z.object({
        interviewId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        recommendation: z.enum(feedbackRecommendation.enumValues),
        comments: z.string().trim().max(5000).nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [iv] = await ctx.tx
        .select({ id: interviews.id, applicationId: interviews.applicationId })
        .from(interviews)
        .where(eq(interviews.id, input.interviewId));
      if (!iv) throw new TRPCError({ code: "NOT_FOUND", message: "Interview not found" });

      const [existing] = await ctx.tx
        .select({ id: interviewFeedback.id, createdAt: interviewFeedback.createdAt })
        .from(interviewFeedback)
        .where(
          and(
            eq(interviewFeedback.interviewId, input.interviewId),
            eq(interviewFeedback.authorUserId, ctx.session.user.id)
          )
        );

      if (existing) {
        if (Date.now() - existing.createdAt.getTime() > FEEDBACK_EDIT_WINDOW_MS) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Feedback is locked 15 minutes after it is first submitted"
          });
        }
        const [updated] = await ctx.tx
          .update(interviewFeedback)
          .set({
            rating: input.rating,
            recommendation: input.recommendation,
            comments: input.comments ?? null
          })
          .where(eq(interviewFeedback.id, existing.id))
          .returning();
        return updated;
      }

      const [created] = await ctx.tx
        .insert(interviewFeedback)
        .values({
          workspaceId: ctx.workspaceId,
          interviewId: input.interviewId,
          applicationId: iv.applicationId,
          authorUserId: ctx.session.user.id,
          rating: input.rating,
          recommendation: input.recommendation,
          comments: input.comments ?? null
        })
        .returning();
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "interview.feedback_added",
        targetType: "application",
        targetId: iv.applicationId,
        meta: { interviewId: input.interviewId }
      });
      return created;
    })
});
