import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { reportCadence, reportSchedules } from "@emerge/db";
import { computeNextRun } from "@emerge/reports";
import { REPORT_KEY_VALUES, reportFiltersSchema } from "@/lib/reports";
import { writeAudit } from "../audit";
import { router, workspaceProcedure } from "../trpc";

const scheduleInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  reportKey: z.enum(REPORT_KEY_VALUES),
  filters: reportFiltersSchema.default({}),
  cadence: z.enum(reportCadence.enumValues),
  recipients: z.array(z.string().trim().email()).min(1, "At least one recipient").max(50),
  hourUtc: z.number().int().min(0).max(23).default(7),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  dayOfMonth: z.number().int().min(1).max(28).nullable().optional(),
  active: z.boolean().default(true)
});

/** Filters arrive with Date objects (superjson); store them as ISO strings. */
function serializeFilters(f: z.infer<typeof reportFiltersSchema>): Record<string, unknown> {
  return {
    ...(f.from ? { from: f.from.toISOString() } : {}),
    ...(f.to ? { to: f.to.toISOString() } : {}),
    ...(f.userId ? { userId: f.userId } : {}),
    ...(f.companyId ? { companyId: f.companyId } : {})
  };
}

export const reportSchedulesRouter = router({
  list: workspaceProcedure.query(async ({ ctx }) => {
    return ctx.tx.select().from(reportSchedules).orderBy(asc(reportSchedules.name));
  }),

  create: workspaceProcedure.input(scheduleInput).mutation(async ({ ctx, input }) => {
    const nextRunAt = computeNextRun(
      input.cadence,
      { hourUtc: input.hourUtc, dayOfWeek: input.dayOfWeek, dayOfMonth: input.dayOfMonth },
      new Date()
    );
    const [created] = await ctx.tx
      .insert(reportSchedules)
      .values({
        workspaceId: ctx.workspaceId,
        name: input.name,
        reportKey: input.reportKey,
        filters: serializeFilters(input.filters),
        cadence: input.cadence,
        recipients: input.recipients,
        hourUtc: input.hourUtc,
        dayOfWeek: input.dayOfWeek ?? null,
        dayOfMonth: input.dayOfMonth ?? null,
        active: input.active,
        nextRunAt,
        createdById: ctx.session.user.id
      })
      .returning();
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await writeAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.session.user.id,
      action: "report_schedule.created",
      targetType: "report_schedule",
      targetId: created.id,
      meta: { name: created.name, reportKey: created.reportKey, cadence: created.cadence }
    });
    return created;
  }),

  update: workspaceProcedure
    .input(z.object({ id: z.string().uuid(), patch: scheduleInput }))
    .mutation(async ({ ctx, input }) => {
      const nextRunAt = computeNextRun(
        input.patch.cadence,
        {
          hourUtc: input.patch.hourUtc,
          dayOfWeek: input.patch.dayOfWeek,
          dayOfMonth: input.patch.dayOfMonth
        },
        new Date()
      );
      const [updated] = await ctx.tx
        .update(reportSchedules)
        .set({
          name: input.patch.name,
          reportKey: input.patch.reportKey,
          filters: serializeFilters(input.patch.filters),
          cadence: input.patch.cadence,
          recipients: input.patch.recipients,
          hourUtc: input.patch.hourUtc,
          dayOfWeek: input.patch.dayOfWeek ?? null,
          dayOfMonth: input.patch.dayOfMonth ?? null,
          active: input.patch.active,
          nextRunAt,
          updatedAt: new Date()
        })
        .where(eq(reportSchedules.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      return updated;
    }),

  setActive: workspaceProcedure
    .input(z.object({ id: z.string().uuid(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.tx
        .update(reportSchedules)
        .set({ active: input.active, updatedAt: new Date() })
        .where(eq(reportSchedules.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      return updated;
    }),

  remove: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [removed] = await ctx.tx
        .delete(reportSchedules)
        .where(eq(reportSchedules.id, input.id))
        .returning({ id: reportSchedules.id });
      if (!removed) throw new TRPCError({ code: "NOT_FOUND", message: "Schedule not found" });
      return { ok: true };
    })
});
