import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { applications, candidates, jobs, placements, users } from "@emerge/db";
import { writeAudit } from "../audit";
import { humanId, nextCounter } from "../counters";
import { ensureStatuses, setApplicationStatus } from "../submissions";
import { router, workspaceProcedure } from "../trpc";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .nullable()
  .optional();

const listCols = {
  id: placements.id,
  humanId: placements.humanId,
  applicationId: placements.applicationId,
  offerId: placements.offerId,
  jobId: placements.jobId,
  candidateId: placements.candidateId,
  startDate: placements.startDate,
  feeAmount: placements.feeAmount,
  currency: placements.currency,
  note: placements.note,
  createdAt: placements.createdAt,
  candidateFirstName: candidates.firstName,
  candidateLastName: candidates.lastName,
  jobTitle: jobs.title,
  jobHumanId: jobs.humanId,
  placedByName: users.name
};

export const placementsRouter = router({
  /** Record a hire against an application; moves it to "Hired". */
  create: workspaceProcedure
    .input(
      z.object({
        applicationId: z.string().uuid(),
        offerId: z.string().uuid().nullable().optional(),
        startDate: dateInput,
        feeAmount: z.number().int().min(0).max(1_000_000_000).nullable().optional(),
        currency: optionalText(8),
        note: optionalText(5000)
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ensureStatuses(ctx.tx, ctx.workspaceId);
      const [app] = await ctx.tx
        .select({
          id: applications.id,
          jobId: applications.jobId,
          candidateId: applications.candidateId
        })
        .from(applications)
        .where(and(eq(applications.id, input.applicationId), isNull(applications.deletedAt)));
      if (!app) throw new TRPCError({ code: "BAD_REQUEST", message: "Application not found" });

      const [existing] = await ctx.tx
        .select({ id: placements.id })
        .from(placements)
        .where(eq(placements.applicationId, input.applicationId));
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "This application is already placed" });
      }

      const next = await nextCounter(ctx.tx, ctx.workspaceId, "placement");
      const [created] = await ctx.tx
        .insert(placements)
        .values({
          workspaceId: ctx.workspaceId,
          humanId: humanId("PLC", next),
          applicationId: input.applicationId,
          offerId: input.offerId ?? null,
          jobId: app.jobId,
          candidateId: app.candidateId,
          startDate: input.startDate ?? null,
          feeAmount: input.feeAmount ?? null,
          currency: input.currency ?? null,
          note: input.note ?? null,
          placedById: ctx.session.user.id
        })
        .returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await setApplicationStatus(ctx.tx, {
        workspaceId: ctx.workspaceId,
        applicationId: input.applicationId,
        statusKey: "hired",
        actorUserId: ctx.session.user.id,
        note: "Placed / hired"
      });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "placement.created",
        targetType: "application",
        targetId: input.applicationId,
        meta: { placementId: created.id, humanId: created.humanId, feeAmount: created.feeAmount }
      });
      return created;
    }),

  /** Placement for one application, if any (banner on the application record). */
  forApplication: workspaceProcedure
    .input(z.object({ applicationId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .select(listCols)
        .from(placements)
        .leftJoin(candidates, eq(candidates.id, placements.candidateId))
        .leftJoin(jobs, eq(jobs.id, placements.jobId))
        .leftJoin(users, eq(users.id, placements.placedById))
        .where(eq(placements.applicationId, input.applicationId));
      return row ?? null;
    }),

  byJob: workspaceProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select(listCols)
        .from(placements)
        .leftJoin(candidates, eq(candidates.id, placements.candidateId))
        .leftJoin(jobs, eq(jobs.id, placements.jobId))
        .leftJoin(users, eq(users.id, placements.placedById))
        .where(eq(placements.jobId, input.jobId))
        .orderBy(desc(placements.createdAt));
    }),

  /** Recent placements across the workspace (used by the revenue surfaces). */
  list: workspaceProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }))
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select(listCols)
        .from(placements)
        .leftJoin(candidates, eq(candidates.id, placements.candidateId))
        .leftJoin(jobs, eq(jobs.id, placements.jobId))
        .leftJoin(users, eq(users.id, placements.placedById))
        .orderBy(desc(placements.createdAt))
        .limit(input.limit);
    }),

  /** Remove a placement and revert the offer-accepted/hired state to review. */
  remove: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .delete(placements)
        .where(eq(placements.id, input.id))
        .returning({ id: placements.id, applicationId: placements.applicationId });
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Placement not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "placement.removed",
        targetType: "application",
        targetId: row.applicationId,
        meta: { placementId: row.id }
      });
      // Keep the linked offer/status as-is; unwinding a hire is a manual decision.
      return { ok: true };
    })
});
