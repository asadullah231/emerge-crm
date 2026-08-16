import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { applications, offerMedium, offerStatusHistory, offers, users } from "@emerge/db";
import { writeAudit } from "../audit";
import { humanId, nextCounter } from "../counters";
import { isOfferOverdue, transitionOffer } from "../offers";
import { ensureStatuses } from "../submissions";
import { router, workspaceProcedure } from "../trpc";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

/** Turn "YYYY-MM-DD" (or empty) into the value the `date` column stores. */
const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .nullable()
  .optional();

async function requireOffer(
  tx: Parameters<typeof transitionOffer>[0],
  id: string
): Promise<typeof offers.$inferSelect> {
  const [row] = await tx.select().from(offers).where(eq(offers.id, id));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Offer not found" });
  return row;
}

export const offersRouter = router({
  /** All offers on one application, newest first, with an overdue flag. */
  byApplication: workspaceProcedure
    .input(z.object({ applicationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.tx
        .select({
          id: offers.id,
          humanId: offers.humanId,
          status: offers.status,
          medium: offers.medium,
          salaryAmount: offers.salaryAmount,
          currency: offers.currency,
          startDate: offers.startDate,
          letterHtml: offers.letterHtml,
          note: offers.note,
          sentAt: offers.sentAt,
          expiresAt: offers.expiresAt,
          acceptedAt: offers.acceptedAt,
          declinedAt: offers.declinedAt,
          withdrawnAt: offers.withdrawnAt,
          declineReason: offers.declineReason,
          createdAt: offers.createdAt,
          sentByName: users.name
        })
        .from(offers)
        .leftJoin(users, eq(users.id, offers.sentById))
        .where(eq(offers.applicationId, input.applicationId))
        .orderBy(desc(offers.createdAt));
      return rows.map((r) => ({ ...r, overdue: isOfferOverdue(r) }));
    }),

  /** One offer plus its status history (offer detail / audit trail). */
  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const offer = await requireOffer(ctx.tx, input.id);
      const history = await ctx.tx
        .select()
        .from(offerStatusHistory)
        .where(eq(offerStatusHistory.offerId, input.id))
        .orderBy(desc(offerStatusHistory.createdAt));
      return { ...offer, overdue: isOfferOverdue(offer), history };
    }),

  /** Create a draft offer against an application. */
  create: workspaceProcedure
    .input(
      z.object({
        applicationId: z.string().uuid(),
        medium: z.enum(offerMedium.enumValues).default("link"),
        salaryAmount: z.number().int().min(0).max(100_000_000).nullable().optional(),
        currency: optionalText(8),
        startDate: dateInput,
        letterHtml: optionalText(50_000),
        note: optionalText(5000)
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureStatuses(ctx.tx, ctx.workspaceId);
      const [app] = await ctx.tx
        .select({ id: applications.id })
        .from(applications)
        .where(and(eq(applications.id, input.applicationId), isNull(applications.deletedAt)));
      if (!app) throw new TRPCError({ code: "BAD_REQUEST", message: "Application not found" });

      const next = await nextCounter(ctx.tx, ctx.workspaceId, "offer");
      const [created] = await ctx.tx
        .insert(offers)
        .values({
          workspaceId: ctx.workspaceId,
          humanId: humanId("OFFER", next),
          applicationId: input.applicationId,
          status: "draft",
          medium: input.medium,
          salaryAmount: input.salaryAmount ?? null,
          currency: input.currency ?? null,
          startDate: input.startDate ?? null,
          letterHtml: input.letterHtml ?? null,
          note: input.note ?? null,
          createdById: ctx.session.user.id
        })
        .returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "offer.created",
        targetType: "application",
        targetId: input.applicationId,
        meta: { offerId: created.id, humanId: created.humanId }
      });
      return created;
    }),

  /** Edit a draft offer (locked once sent). */
  update: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        patch: z.object({
          medium: z.enum(offerMedium.enumValues).optional(),
          salaryAmount: z.number().int().min(0).max(100_000_000).nullable().optional(),
          currency: optionalText(8),
          startDate: dateInput,
          letterHtml: optionalText(50_000),
          note: optionalText(5000)
        })
      })
    )
    .mutation(async ({ ctx, input }) => {
      const offer = await requireOffer(ctx.tx, input.id);
      if (offer.status !== "draft") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only draft offers can be edited" });
      }
      const [updated] = await ctx.tx
        .update(offers)
        .set({ ...input.patch, updatedAt: new Date() })
        .where(eq(offers.id, input.id))
        .returning();
      return updated;
    }),

  /** Send a draft offer: application moves to "Offer made", expiry optional. */
  send: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        expiresInDays: z.number().int().min(1).max(120).nullable().optional(),
        medium: z.enum(offerMedium.enumValues).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.medium) {
        await ctx.tx.update(offers).set({ medium: input.medium }).where(eq(offers.id, input.id));
      }
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;
      const result = await transitionOffer(ctx.tx, {
        workspaceId: ctx.workspaceId,
        offerId: input.id,
        to: "sent",
        actorUserId: ctx.session.user.id,
        sentById: ctx.session.user.id,
        expiresAt
      });
      if (!result) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only a draft offer can be sent" });
      }
      return { ok: true };
    }),

  /** Candidate accepted: application moves to "Offer accepted". */
  accept: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await transitionOffer(ctx.tx, {
        workspaceId: ctx.workspaceId,
        offerId: input.id,
        to: "accepted",
        actorUserId: ctx.session.user.id
      });
      if (!result) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only a sent offer can be accepted" });
      }
      return { ok: true };
    }),

  /** Candidate declined: application moves to "Offer declined" (terminal). */
  decline: workspaceProcedure
    .input(z.object({ id: z.string().uuid(), reason: optionalText(500) }))
    .mutation(async ({ ctx, input }) => {
      const result = await transitionOffer(ctx.tx, {
        workspaceId: ctx.workspaceId,
        offerId: input.id,
        to: "declined",
        actorUserId: ctx.session.user.id,
        reason: input.reason ?? null
      });
      if (!result) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only a sent offer can be declined" });
      }
      return { ok: true };
    }),

  /** Agency pulled the offer: application moves to "Offer withdrawn" (terminal). */
  withdraw: workspaceProcedure
    .input(z.object({ id: z.string().uuid(), reason: optionalText(500) }))
    .mutation(async ({ ctx, input }) => {
      const result = await transitionOffer(ctx.tx, {
        workspaceId: ctx.workspaceId,
        offerId: input.id,
        to: "withdrawn",
        actorUserId: ctx.session.user.id,
        reason: input.reason ?? null
      });
      if (!result) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only a draft or sent offer can be withdrawn"
        });
      }
      return { ok: true };
    })
});
