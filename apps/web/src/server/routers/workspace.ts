import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { auditLog, users, workspaces } from "@emerge/db";
import { writeAudit } from "../audit";
import { adminProcedure, router } from "../trpc";

export const workspaceRouter = router({
  auditLog: adminProcedure
    .input(z.object({ limit: z.number().int().min(1).max(200).default(100) }).default({}))
    .query(async ({ ctx, input }) => {
      // RLS scopes rows to the current workspace automatically.
      return ctx.tx
        .select({
          id: auditLog.id,
          action: auditLog.action,
          targetType: auditLog.targetType,
          targetId: auditLog.targetId,
          meta: auditLog.meta,
          createdAt: auditLog.createdAt,
          actorName: users.name,
          actorEmail: users.email
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorUserId))
        .orderBy(desc(auditLog.createdAt))
        .limit(input.limit);
    }),

  update: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Workspace name is required").max(200),
        logoUrl: z.string().trim().url().nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.tx
        .update(workspaces)
        .set({ name: input.name, logoUrl: input.logoUrl ?? null })
        .where(eq(workspaces.id, ctx.workspaceId))
        .returning({ id: workspaces.id, name: workspaces.name, logoUrl: workspaces.logoUrl });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "workspace.updated",
        targetType: "workspace",
        targetId: ctx.workspaceId,
        meta: { name: input.name }
      });
      return updated;
    })
});
