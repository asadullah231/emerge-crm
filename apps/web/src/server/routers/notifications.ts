import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { notes, notifications, users } from "@emerge/db";
import { router, workspaceProcedure } from "../trpc";

export const notificationsRouter = router({
  /** The signed-in user's notifications, newest first. */
  list: workspaceProcedure
    .input(
      z.object({
        unreadOnly: z.boolean().default(false),
        limit: z.number().int().min(1).max(50).default(20)
      })
    )
    .query(async ({ ctx, input }) => {
      const where = and(
        eq(notifications.recipientId, ctx.session.user.id),
        input.unreadOnly ? isNull(notifications.readAt) : undefined
      );
      return ctx.tx
        .select({
          id: notifications.id,
          kind: notifications.kind,
          entityType: notifications.entityType,
          entityId: notifications.entityId,
          noteId: notifications.noteId,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
          actorName: users.name,
          noteBody: notes.body
        })
        .from(notifications)
        .leftJoin(users, eq(users.id, notifications.actorId))
        .leftJoin(notes, eq(notes.id, notifications.noteId))
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(input.limit);
    }),

  unreadCount: workspaceProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.tx
      .select({ total: count() })
      .from(notifications)
      .where(and(eq(notifications.recipientId, ctx.session.user.id), isNull(notifications.readAt)));
    return row?.total ?? 0;
  }),

  markRead: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.tx
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.id, input.id),
            eq(notifications.recipientId, ctx.session.user.id),
            isNull(notifications.readAt)
          )
        );
      return { id: input.id };
    }),

  markAllRead: workspaceProcedure.mutation(async ({ ctx }) => {
    await ctx.tx
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.recipientId, ctx.session.user.id), isNull(notifications.readAt)));
    return { ok: true };
  })
});
