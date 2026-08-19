import { count, desc, eq, isNull } from "drizzle-orm";
import { companies, jobs } from "@emerge/db";
import { authenticate, json, paging, withApiWorkspace } from "@/server/public-api";

/** GET /api/v1/jobs - paged list (scope read:jobs). */
export async function GET(req: Request) {
  const auth = await authenticate(req, "read:jobs");
  if (auth instanceof Response) return auth;
  const { page, perPage, offset } = paging(req);

  const { rows, total } = await withApiWorkspace(auth, async (tx) => {
    const [rows, [totalRow]] = await Promise.all([
      tx
        .select({
          id: jobs.id,
          humanId: jobs.humanId,
          title: jobs.title,
          status: jobs.status,
          employmentType: jobs.employmentType,
          workMode: jobs.workMode,
          location: jobs.location,
          city: jobs.city,
          country: jobs.country,
          positions: jobs.positions,
          isHot: jobs.isHot,
          clientName: companies.name,
          openedAt: jobs.openedAt,
          targetCloseAt: jobs.targetCloseAt,
          closedAt: jobs.closedAt,
          createdAt: jobs.createdAt,
          updatedAt: jobs.updatedAt
        })
        .from(jobs)
        .leftJoin(companies, eq(companies.id, jobs.companyId))
        .where(isNull(jobs.deletedAt))
        .orderBy(desc(jobs.openedAt))
        .limit(perPage)
        .offset(offset),
      tx.select({ total: count() }).from(jobs).where(isNull(jobs.deletedAt))
    ]);
    return { rows, total: totalRow?.total ?? 0 };
  });
  return json({ data: rows, page, per_page: perPage, total });
}
