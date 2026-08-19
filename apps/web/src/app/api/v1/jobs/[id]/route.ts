import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { companies, jobs } from "@emerge/db";
import { apiError, authenticate, json, withApiWorkspace } from "@/server/public-api";

/** GET /api/v1/jobs/:id (scope read:jobs). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, "read:jobs");
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError(400, "Invalid job id");

  const [row] = await withApiWorkspace(auth, (tx) =>
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
        description: jobs.description,
        requiredSkills: jobs.requiredSkills,
        salaryText: jobs.salaryText,
        clientName: companies.name,
        openedAt: jobs.openedAt,
        targetCloseAt: jobs.targetCloseAt,
        closedAt: jobs.closedAt,
        createdAt: jobs.createdAt,
        updatedAt: jobs.updatedAt
      })
      .from(jobs)
      .leftJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(eq(jobs.id, id), isNull(jobs.deletedAt)))
  );
  if (!row) return apiError(404, "Job not found");
  return json({ data: row });
}
