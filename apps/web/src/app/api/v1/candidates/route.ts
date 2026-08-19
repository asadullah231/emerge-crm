import { count, desc, isNull } from "drizzle-orm";
import { z } from "zod";
import { candidates } from "@emerge/db";
import { humanId, nextCounter } from "@/server/counters";
import { apiError, authenticate, json, paging, withApiWorkspace } from "@/server/public-api";
import { emitWebhook } from "@/server/webhooks";

const candidateFields = {
  id: candidates.id,
  humanId: candidates.humanId,
  firstName: candidates.firstName,
  lastName: candidates.lastName,
  email: candidates.email,
  phone: candidates.phone,
  title: candidates.title,
  currentEmployer: candidates.currentEmployer,
  city: candidates.city,
  country: candidates.country,
  skills: candidates.skills,
  source: candidates.source,
  createdAt: candidates.createdAt,
  updatedAt: candidates.updatedAt
};

/** GET /api/v1/candidates - paged list (scope read:candidates). */
export async function GET(req: Request) {
  const auth = await authenticate(req, "read:candidates");
  if (auth instanceof Response) return auth;
  const { page, perPage, offset } = paging(req);

  const { rows, total } = await withApiWorkspace(auth, async (tx) => {
    const [rows, [totalRow]] = await Promise.all([
      tx
        .select(candidateFields)
        .from(candidates)
        .where(isNull(candidates.deletedAt))
        .orderBy(desc(candidates.createdAt))
        .limit(perPage)
        .offset(offset),
      tx.select({ total: count() }).from(candidates).where(isNull(candidates.deletedAt))
    ]);
    return { rows, total: totalRow?.total ?? 0 };
  });
  return json({ data: rows, page, per_page: perPage, total });
}

const createSchema = z.object({
  firstName: z.string().trim().max(120).optional(),
  lastName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255).optional(),
  phone: z.string().trim().max(60).optional(),
  title: z.string().trim().max(255).optional(),
  currentEmployer: z.string().trim().max(255).optional(),
  city: z.string().trim().max(120).optional(),
  country: z.string().trim().max(120).optional(),
  skills: z.string().trim().max(5000).optional()
});

/** POST /api/v1/candidates - create (scope write:candidates). */
export async function POST(req: Request) {
  const auth = await authenticate(req, "write:candidates");
  if (auth instanceof Response) return auth;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (err) {
    return apiError(400, err instanceof z.ZodError ? err.issues[0]!.message : "Invalid JSON body");
  }

  const created = await withApiWorkspace(auth, async (tx) => {
    const next = await nextCounter(tx, auth.workspaceId, "candidate");
    const [row] = await tx
      .insert(candidates)
      .values({
        workspaceId: auth.workspaceId,
        humanId: humanId("CAND", next),
        firstName: body.firstName ?? null,
        lastName: body.lastName,
        email: body.email?.toLowerCase() ?? null,
        phone: body.phone ?? null,
        title: body.title ?? null,
        currentEmployer: body.currentEmployer ?? null,
        city: body.city ?? null,
        country: body.country ?? null,
        skills: body.skills ?? null,
        source: "api"
      })
      .returning(candidateFields);
    if (row) {
      await emitWebhook(tx, auth.workspaceId, "candidate.created", {
        candidateId: row.id,
        humanId: row.humanId,
        name: [row.firstName, row.lastName].filter(Boolean).join(" "),
        via: "public_api"
      });
    }
    return row;
  });
  if (!created) return apiError(500, "Failed to create candidate");
  return json({ data: created }, 201);
}
