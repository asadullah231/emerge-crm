import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { emailTemplates } from "@emerge/db";
import { writeAudit } from "../audit";
import { router, workspaceProcedure } from "../trpc";

export const emailTemplatesRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    return ctx.tx
      .select()
      .from(emailTemplates)
      .orderBy(asc(emailTemplates.category), asc(emailTemplates.name));
  }),

  create: workspaceProcedure
    .input(
      z.object({
        name: z.string().trim().min(1, "Name is required").max(200),
        subject: z.string().trim().min(1, "Subject is required").max(500),
        bodyHtml: z.string().trim().min(1, "Body is required").max(50_000),
        category: z.string().trim().max(80).nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.tx
        .insert(emailTemplates)
        .values({
          workspaceId: ctx.workspaceId,
          name: input.name,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          category: input.category ?? null,
          createdById: ctx.session.user.id
        })
        .returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "email_template.created",
        targetType: "email_template",
        targetId: created.id,
        meta: { name: created.name }
      });
      return created;
    }),

  update: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        patch: z.object({
          name: z.string().trim().min(1).max(200).optional(),
          subject: z.string().trim().min(1).max(500).optional(),
          bodyHtml: z.string().trim().min(1).max(50_000).optional(),
          category: z.string().trim().max(80).nullable().optional()
        })
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.tx
        .update(emailTemplates)
        .set({ ...input.patch, updatedAt: new Date() })
        .where(eq(emailTemplates.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return updated;
    }),

  remove: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [removed] = await ctx.tx
        .delete(emailTemplates)
        .where(eq(emailTemplates.id, input.id))
        .returning({ id: emailTemplates.id });
      if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "Template not found" });
      return { ok: true };
    })
});
