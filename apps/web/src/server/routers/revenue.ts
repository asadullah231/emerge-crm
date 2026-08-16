import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { companies, jobRevenue, jobs, placements, users } from "@emerge/db";
import { writeAudit } from "../audit";
import { router, workspaceProcedure } from "../trpc";

type JobRow = {
  jobId: string;
  jobTitle: string;
  jobHumanId: string;
  status: string;
  positions: number;
  companyId: string | null;
  companyName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  revenuePerPosition: number | null;
  currency: string | null;
};

/** expected = revenuePerPosition x positions; actual = sum of placement fees. */
function computeRow(job: JobRow, actual: number, placementsCount: number) {
  const expected = (job.revenuePerPosition ?? 0) * job.positions;
  const missed = expected > actual ? expected - actual : 0;
  return { ...job, expected, actual, placementsCount, missed };
}

function rollup<
  T extends { expected: number; actual: number; missed: number; placementsCount: number }
>(rows: T[], keyOf: (r: T) => string | null, labelOf: (r: T) => string | null) {
  const map = new Map<
    string,
    {
      key: string | null;
      label: string | null;
      expected: number;
      actual: number;
      missed: number;
      placementsCount: number;
      jobs: number;
    }
  >();
  for (const r of rows) {
    const key = keyOf(r) ?? "__none__";
    const acc = map.get(key) ?? {
      key: keyOf(r),
      label: labelOf(r),
      expected: 0,
      actual: 0,
      missed: 0,
      placementsCount: 0,
      jobs: 0
    };
    acc.expected += r.expected;
    acc.actual += r.actual;
    acc.missed += r.missed;
    acc.placementsCount += r.placementsCount;
    acc.jobs += 1;
    map.set(key, acc);
  }
  return [...map.values()].sort((a, b) => b.actual - a.actual);
}

export const revenueRouter = router({
  /** Expected vs actual revenue rolled up per job, per client and per AM. */
  summary: workspaceProcedure
    .input(
      z
        .object({
          companyId: z.string().uuid().optional(),
          ownerId: z.string().uuid().optional()
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const filters = [isNull(jobs.deletedAt)];
      if (input?.companyId) filters.push(eq(jobs.companyId, input.companyId));
      if (input?.ownerId) filters.push(eq(jobs.ownerId, input.ownerId));

      const jobRows = (await ctx.tx
        .select({
          jobId: jobs.id,
          jobTitle: jobs.title,
          jobHumanId: jobs.humanId,
          status: jobs.status,
          positions: jobs.positions,
          companyId: jobs.companyId,
          companyName: companies.name,
          ownerId: jobs.ownerId,
          ownerName: users.name,
          revenuePerPosition: jobRevenue.revenuePerPosition,
          currency: jobRevenue.currency
        })
        .from(jobs)
        .leftJoin(companies, eq(companies.id, jobs.companyId))
        .leftJoin(users, eq(users.id, jobs.ownerId))
        .leftJoin(jobRevenue, eq(jobRevenue.jobId, jobs.id))
        .where(and(...filters))) as JobRow[];

      const placeRows = await ctx.tx
        .select({ jobId: placements.jobId, feeAmount: placements.feeAmount })
        .from(placements);
      const actualByJob = new Map<string, { fee: number; count: number }>();
      for (const p of placeRows) {
        const acc = actualByJob.get(p.jobId) ?? { fee: 0, count: 0 };
        acc.fee += p.feeAmount ?? 0;
        acc.count += 1;
        actualByJob.set(p.jobId, acc);
      }

      const byJob = jobRows
        .map((j) => {
          const a = actualByJob.get(j.jobId) ?? { fee: 0, count: 0 };
          return computeRow(j, a.fee, a.count);
        })
        // Only jobs with an expected target or a realised placement are interesting.
        .filter((r) => r.expected > 0 || r.actual > 0 || r.placementsCount > 0);

      const totals = byJob.reduce(
        (t, r) => ({
          expected: t.expected + r.expected,
          actual: t.actual + r.actual,
          missed: t.missed + r.missed,
          placementsCount: t.placementsCount + r.placementsCount,
          jobs: t.jobs + 1
        }),
        { expected: 0, actual: 0, missed: 0, placementsCount: 0, jobs: 0 }
      );

      return {
        byJob: byJob.sort((a, b) => b.actual - a.actual),
        byClient: rollup(
          byJob,
          (r) => r.companyId,
          (r) => r.companyName
        ),
        byOwner: rollup(
          byJob,
          (r) => r.ownerId,
          (r) => r.ownerName
        ),
        totals
      };
    }),

  /** Revenue detail for one job (panel on the job record). */
  forJob: workspaceProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [job] = await ctx.tx
        .select({
          jobId: jobs.id,
          jobTitle: jobs.title,
          positions: jobs.positions,
          status: jobs.status,
          revenuePerPosition: jobRevenue.revenuePerPosition,
          currency: jobRevenue.currency,
          note: jobRevenue.note
        })
        .from(jobs)
        .leftJoin(jobRevenue, eq(jobRevenue.jobId, jobs.id))
        .where(and(eq(jobs.id, input.jobId), isNull(jobs.deletedAt)));
      if (!job) return null;

      const rows = await ctx.tx
        .select({ feeAmount: placements.feeAmount })
        .from(placements)
        .where(eq(placements.jobId, input.jobId));
      const actual = rows.reduce((s, r) => s + (r.feeAmount ?? 0), 0);
      const expected = (job.revenuePerPosition ?? 0) * job.positions;
      return {
        ...job,
        expected,
        actual,
        placementsCount: rows.length,
        missed: expected > actual ? expected - actual : 0
      };
    }),

  /** Set (upsert) the expected revenue-per-position target for a job. */
  setTarget: workspaceProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        revenuePerPosition: z.number().int().min(0).max(1_000_000_000).nullable(),
        currency: z.string().trim().max(8).nullable().optional(),
        note: z.string().trim().max(2000).nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .insert(jobRevenue)
        .values({
          workspaceId: ctx.workspaceId,
          jobId: input.jobId,
          revenuePerPosition: input.revenuePerPosition,
          currency: input.currency ?? null,
          note: input.note ?? null
        })
        .onConflictDoUpdate({
          target: jobRevenue.jobId,
          set: {
            revenuePerPosition: input.revenuePerPosition,
            currency: input.currency ?? null,
            note: input.note ?? null,
            updatedAt: new Date()
          }
        })
        .returning();
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "job.revenue_target_set",
        targetType: "job",
        targetId: input.jobId,
        meta: { revenuePerPosition: input.revenuePerPosition }
      });
      return row;
    }),

  /** Recent placements feed for the revenue dashboard. */
  recentPlacements: workspaceProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select({
          id: placements.id,
          humanId: placements.humanId,
          jobId: placements.jobId,
          jobTitle: jobs.title,
          feeAmount: placements.feeAmount,
          currency: placements.currency,
          startDate: placements.startDate,
          createdAt: placements.createdAt,
          placedByName: users.name
        })
        .from(placements)
        .leftJoin(jobs, eq(jobs.id, placements.jobId))
        .leftJoin(users, eq(users.id, placements.placedById))
        .orderBy(desc(placements.createdAt))
        .limit(input.limit);
    })
});
