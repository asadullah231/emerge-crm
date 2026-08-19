import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { candidates } from "@emerge/db";
import { apiError, authenticate, json, withApiWorkspace } from "@/server/public-api";

/** GET /api/v1/candidates/:id (scope read:candidates). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req, "read:candidates");
  if (auth instanceof Response) return auth;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return apiError(400, "Invalid candidate id");

  const [row] = await withApiWorkspace(auth, (tx) =>
    tx
      .select({
        id: candidates.id,
        humanId: candidates.humanId,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        email: candidates.email,
        phone: candidates.phone,
        mobile: candidates.mobile,
        title: candidates.title,
        currentEmployer: candidates.currentEmployer,
        city: candidates.city,
        country: candidates.country,
        skills: candidates.skills,
        experienceYears: candidates.experienceYears,
        source: candidates.source,
        createdAt: candidates.createdAt,
        updatedAt: candidates.updatedAt
      })
      .from(candidates)
      .where(and(eq(candidates.id, id), isNull(candidates.deletedAt)))
  );
  if (!row) return apiError(404, "Candidate not found");
  return json({ data: row });
}
