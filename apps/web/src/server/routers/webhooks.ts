import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { webhookDeliveries, webhookSubscriptions } from "@emerge/db";
import { writeAudit } from "../audit";
import { adminProcedure, router } from "../trpc";
import { WEBHOOK_EVENTS } from "../webhooks";

/**
 * Outbound webhook subscriptions (M19). Admin-only management; the signing
 * secret is returned once at creation. Recent deliveries expose status and
 * errors for debugging.
 */
export const webhooksRouter = router({
  events: adminProcedure.query(() => [...WEBHOOK_EVENTS]),

  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.tx
      .select({
        id: webhookSubscriptions.id,
        url: webhookSubscriptions.url,
        events: webhookSubscriptions.events,
        active: webhookSubscriptions.active,
        createdAt: webhookSubscriptions.createdAt
      })
      .from(webhookSubscriptions)
      .orderBy(desc(webhookSubscriptions.createdAt));
  }),

  create: adminProcedure
    .input(
      z.object({
        url: z.string().trim().url().max(500),
        events: z.array(z.enum(WEBHOOK_EVENTS)).min(1)
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!/^https?:\/\//i.test(input.url)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "URL must be http(s)" });
      }
      const secret = `whsec_${randomBytes(24).toString("hex")}`;
      const [created] = await ctx.tx
        .insert(webhookSubscriptions)
        .values({
          workspaceId: ctx.workspaceId,
          url: input.url,
          events: input.events,
          secret,
          createdById: ctx.session.user.id
        })
        .returning({ id: webhookSubscriptions.id });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "webhook.created",
        targetType: "workspace",
        targetId: ctx.workspaceId,
        meta: { url: input.url, events: input.events }
      });
      // Shown once; verify deliveries with HMAC-SHA256 of the raw body.
      return { id: created.id, secret };
    }),

  setActive: adminProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.tx
        .update(webhookSubscriptions)
        .set({ active: input.active, updatedAt: new Date() })
        .where(eq(webhookSubscriptions.id, input.id))
        .returning({ id: webhookSubscriptions.id });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      return updated;
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.tx
        .delete(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, input.id))
        .returning({ id: webhookSubscriptions.id, url: webhookSubscriptions.url });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "webhook.deleted",
        targetType: "workspace",
        targetId: ctx.workspaceId,
        meta: { url: deleted.url }
      });
      return deleted;
    }),

  deliveries: adminProcedure
    .input(z.object({ subscriptionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select({
          id: webhookDeliveries.id,
          event: webhookDeliveries.event,
          status: webhookDeliveries.status,
          attempts: webhookDeliveries.attempts,
          lastError: webhookDeliveries.lastError,
          deliveredAt: webhookDeliveries.deliveredAt,
          createdAt: webhookDeliveries.createdAt
        })
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.subscriptionId, input.subscriptionId))
        .orderBy(desc(webhookDeliveries.createdAt))
        .limit(20);
    })
});
