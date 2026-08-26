import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { notifications, recordFollows, users, type Transaction } from "@emerge/db";
import { NOTABLE_ENTITY_TYPES } from "@/lib/notes";
import { router, workspaceProcedure } from "../trpc";

const entityType = z.enum(NOTABLE_ENTITY_TYPES);

/**
 * Bell notification to everyone following a record, minus the actor (JP-06).
 * Callers fire this after a meaningful change (e.g. a job status change);
 * failures must never break the underlying write, so callers wrap in try.
 */
export async function notifyFollowers(
  tx: Transaction,
  opts: { workspaceId: string; entityType: string; entityId: string; actorId: string }
): Promise<number> {
  const followers = await tx
    .select({ userId: recordFollows.userId })
    .from(recordFollows)
    .where(
      and(eq(recordFollows.entityType, opts.entityType), eq(recordFollows.entityId, opts.entityId))
    );
  const recipients = followers.map((f) => f.userId).filter((id) => id !== opts.actorId);
  if (recipients.length === 0) return 0;
  await tx.insert(notifications).values(
    recipients.map((recipientId) => ({
      workspaceId: opts.workspaceId,
      recipientId,
      kind: "followed_update" as const,
      actorId: opts.actorId,
      entityType: opts.entityType,
      entityId: opts.entityId
    }))
  );
  return recipients.length;
}

export const followsRouter = router({
  /** Whether I follow this record + who else does (record header widget). */
  state: workspaceProcedure
    .input(z.object({ entityType, entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.tx
        .select({ userId: recordFollows.userId, name: users.name })
        .from(recordFollows)
        .leftJoin(users, eq(users.id, recordFollows.userId))
        .where(
          and(
            eq(recordFollows.entityType, input.entityType),
            eq(recordFollows.entityId, input.entityId)
          )
        );
      return {
        following: rows.some((r) => r.userId === ctx.session.user.id),
        count: rows.length,
        followers: rows.map((r) => ({ userId: r.userId, name: r.name }))
      };
    }),

  /** Follow or unfollow a record for the current user. */
  toggle: workspaceProcedure
    .input(z.object({ entityType, entityId: z.string().uuid(), follow: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      if (input.follow) {
        await ctx.tx
          .insert(recordFollows)
          .values({
            workspaceId: ctx.workspaceId,
            userId: ctx.session.user.id,
            entityType: input.entityType,
            entityId: input.entityId
          })
          .onConflictDoNothing();
      } else {
        await ctx.tx
          .delete(recordFollows)
          .where(
            and(
              eq(recordFollows.userId, ctx.session.user.id),
              eq(recordFollows.entityType, input.entityType),
              eq(recordFollows.entityId, input.entityId)
            )
          );
      }
      return { following: input.follow };
    })
});
