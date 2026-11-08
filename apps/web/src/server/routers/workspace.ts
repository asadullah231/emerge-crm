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
        logoUrl: z.string().trim().url().nullable().optional(),
        compactLayout: z.boolean().optional(),
        bdOutreach: z.boolean().optional(),
        weeklyDigest: z.boolean().optional(),
        monthlyTargetPlacements: z.number().int().min(0).max(100000).nullable().optional(),
        monthlyTargetSubmissions: z.number().int().min(0).max(100000).nullable().optional(),
        monthlyTargetRevenue: z.number().int().min(0).max(100000000).nullable().optional(),
        monthlyTargetBdReplies: z.number().int().min(0).max(100000).nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.tx
        .update(workspaces)
        .set({
          name: input.name,
          logoUrl: input.logoUrl ?? null,
          ...(input.compactLayout === undefined ? {} : { compactLayout: input.compactLayout }),
          ...(input.bdOutreach === undefined ? {} : { bdOutreach: input.bdOutreach }),
          ...(input.weeklyDigest === undefined ? {} : { weeklyDigest: input.weeklyDigest }),
          ...(input.monthlyTargetPlacements === undefined
            ? {}
            : { monthlyTargetPlacements: input.monthlyTargetPlacements }),
          ...(input.monthlyTargetSubmissions === undefined
            ? {}
            : { monthlyTargetSubmissions: input.monthlyTargetSubmissions }),
          ...(input.monthlyTargetRevenue === undefined
            ? {}
            : { monthlyTargetRevenue: input.monthlyTargetRevenue }),
          ...(input.monthlyTargetBdReplies === undefined
            ? {}
            : { monthlyTargetBdReplies: input.monthlyTargetBdReplies })
        })
        .where(eq(workspaces.id, ctx.workspaceId))
        .returning({
          id: workspaces.id,
          name: workspaces.name,
          logoUrl: workspaces.logoUrl,
          compactLayout: workspaces.compactLayout,
          bdOutreach: workspaces.bdOutreach,
          weeklyDigest: workspaces.weeklyDigest,
          monthlyTargetPlacements: workspaces.monthlyTargetPlacements,
          monthlyTargetSubmissions: workspaces.monthlyTargetSubmissions,
          monthlyTargetRevenue: workspaces.monthlyTargetRevenue,
          monthlyTargetBdReplies: workspaces.monthlyTargetBdReplies
        });
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
