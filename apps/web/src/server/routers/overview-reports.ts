import { and, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
  applicationStatusHistory,
  companies,
  jobs,
  placements,
  users,
  workspaces
} from "@emerge/db";
import { router, workspaceProcedure } from "../trpc";

/**
 * Strategic Reports overview: month-to-date numbers against the monthly
 * targets set in Settings > Workspace, plus a 6-month history and the
 * month's per-recruiter and per-client breakdowns. BD numbers come from
 * dashboard.bdSnapshot on the client (same NocoDB source as /bd).
 */
export const overviewReportsRouter = router({
  pacing: workspaceProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [targetRows, placementRows, submissionEvents, historyPlacements, topClients] =
      await Promise.all([
        ctx.tx
          .select({
            placements: workspaces.monthlyTargetPlacements,
            submissions: workspaces.monthlyTargetSubmissions,
            revenue: workspaces.monthlyTargetRevenue,
            bdReplies: workspaces.monthlyTargetBdReplies
          })
          .from(workspaces)
          .where(eq(workspaces.id, ctx.workspaceId)),
        // This month's placements with fee + who placed them.
        ctx.tx
          .select({
            id: placements.id,
            feeAmount: placements.feeAmount,
            currency: placements.currency,
            createdAt: placements.createdAt,
            placedByName: users.name
          })
          .from(placements)
          .leftJoin(users, eq(users.id, placements.placedById))
          .where(gte(placements.createdAt, monthStart)),
        // Submission events this month, with the acting recruiter.
        ctx.tx
          .select({
            id: applicationStatusHistory.id,
            createdAt: applicationStatusHistory.createdAt,
            actorName: users.name
          })
          .from(applicationStatusHistory)
          .leftJoin(users, eq(users.id, applicationStatusHistory.actorUserId))
          .where(
            and(
              eq(applicationStatusHistory.toStage, "submitted"),
              gte(applicationStatusHistory.createdAt, monthStart)
            )
          ),
        // 6-month history: placements and submissions per month.
        ctx.tx
          .select({
            month: sql<string>`to_char(${placements.createdAt}, 'YYYY-MM')`,
            c: sql<number>`count(*)`
          })
          .from(placements)
          .where(gte(placements.createdAt, sixMonthsAgo))
          .groupBy(sql`to_char(${placements.createdAt}, 'YYYY-MM')`),
        // This month's placements per client.
        ctx.tx
          .select({
            companyName: companies.name,
            c: sql<number>`count(*)`,
            fees: sql<number>`coalesce(sum(${placements.feeAmount}), 0)`
          })
          .from(placements)
          .innerJoin(jobs, eq(jobs.id, placements.jobId))
          .leftJoin(companies, eq(companies.id, jobs.companyId))
          .where(gte(placements.createdAt, monthStart))
          .groupBy(companies.name)
          .orderBy(desc(sql`count(*)`))
          .limit(8)
      ]);

    const historySubmissions = await ctx.tx
      .select({
        month: sql<string>`to_char(${applicationStatusHistory.createdAt}, 'YYYY-MM')`,
        c: sql<number>`count(*)`
      })
      .from(applicationStatusHistory)
      .where(
        and(
          eq(applicationStatusHistory.toStage, "submitted"),
          gte(applicationStatusHistory.createdAt, sixMonthsAgo)
        )
      )
      .groupBy(sql`to_char(${applicationStatusHistory.createdAt}, 'YYYY-MM')`);

    // Open jobs count gives the "how much work is on the desk" context line.
    const [openJobs] = await ctx.tx
      .select({ c: sql<number>`count(*)` })
      .from(jobs)
      .where(and(isNull(jobs.deletedAt), eq(jobs.status, "open"), lte(jobs.openedAt, now)));

    // Revenue per currency (fees are whole units; GBP unless recorded otherwise).
    const revenue = new Map<string, number>();
    for (const p of placementRows) {
      if (p.feeAmount) {
        const cur = p.currency ?? "GBP";
        revenue.set(cur, (revenue.get(cur) ?? 0) + p.feeAmount);
      }
    }

    // Per-recruiter month-to-date: submissions + placements.
    const perRecruiter = new Map<string, { submissions: number; placements: number }>();
    const bump = (name: string | null, key: "submissions" | "placements") => {
      const n = name ?? "Unknown";
      const row = perRecruiter.get(n) ?? { submissions: 0, placements: 0 };
      row[key] += 1;
      perRecruiter.set(n, row);
    };
    for (const s of submissionEvents) bump(s.actorName, "submissions");
    for (const p of placementRows) bump(p.placedByName, "placements");

    // 6 calendar months, oldest first, zero-filled.
    const months: { month: string; placements: number; submissions: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({
        month: key,
        placements: Number(historyPlacements.find((h) => h.month === key)?.c ?? 0),
        submissions: Number(historySubmissions.find((h) => h.month === key)?.c ?? 0)
      });
    }

    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    return {
      month: { day: now.getDate(), days: daysInMonth },
      targets: targetRows[0] ?? {
        placements: null,
        submissions: null,
        revenue: null,
        bdReplies: null
      },
      actual: {
        placements: placementRows.length,
        submissions: submissionEvents.length,
        revenue: [...revenue.entries()].map(([currency, amount]) => ({ currency, amount }))
      },
      openJobs: Number(openJobs?.c ?? 0),
      perRecruiter: [...perRecruiter.entries()]
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.placements - a.placements || b.submissions - a.submissions),
      topClients: topClients.map((c) => ({
        name: c.companyName ?? "No client",
        placements: Number(c.c),
        fees: Number(c.fees)
      })),
      months
    };
  })
});
