import { count, desc, eq, isNull } from "drizzle-orm";
import { applications, candidates, jobs } from "@emerge/db";
import { authenticate, json, paging, withApiWorkspace } from "@/server/public-api";

/** GET /api/v1/applications - paged list (scope read:applications). */
export async function GET(req: Request) {
  const auth = await authenticate(req, "read:applications");
  if (auth instanceof Response) return auth;
  const { page, perPage, offset } = paging(req);

  const { rows, total } = await withApiWorkspace(auth, async (tx) => {
    const [rows, [totalRow]] = await Promise.all([
      tx
        .select({
          id: applications.id,
          humanId: applications.humanId,
          stage: applications.stage,
          statusKey: applications.statusKey,
          rating: applications.rating,
          source: applications.source,
          candidateId: applications.candidateId,
          candidateFirstName: candidates.firstName,
          candidateLastName: candidates.lastName,
          jobId: applications.jobId,
          jobTitle: jobs.title,
          jobHumanId: jobs.humanId,
          stageEnteredAt: applications.stageEnteredAt,
          createdAt: applications.createdAt,
          updatedAt: applications.updatedAt
        })
        .from(applications)
        .innerJoin(candidates, eq(candidates.id, applications.candidateId))
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(isNull(applications.deletedAt))
        .orderBy(desc(applications.stageEnteredAt))
        .limit(perPage)
        .offset(offset),
      tx.select({ total: count() }).from(applications).where(isNull(applications.deletedAt))
    ]);
    return { rows, total: totalRow?.total ?? 0 };
  });
  return json({ data: rows, page, per_page: perPage, total });
}
