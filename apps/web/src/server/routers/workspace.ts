import { eq } from "drizzle-orm";
import { z } from "zod";
import { workspaces } from "@emerge/db";
import { writeAudit } from "../audit";
import { adminProcedure, router } from "../trpc";

export const workspaceRouter = router({
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
