import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { submissions, withWorkspace } from "@emerge/db";
import { db } from "@/server/db";
import { clientIp, rateLimit } from "@/server/rate-limit";
import { applyVerdict, hashToken } from "@/server/submissions";

const bodySchema = z.object({
  submissionId: z.string().uuid(),
  verdict: z.enum(["approved", "rejected"]),
  comment: z.string().trim().max(2000).optional()
});

/**
 * Public, no-login client verdict on a shared submission. Rate-limited per ip
 * and per token. Resolves the workspace from the token hash on the owner
 * connection, then writes the verdict + application status inside that
 * workspace's RLS transaction.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!rateLimit(`share:${clientIp(req)}`, 30, 60_000)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }
  if (!rateLimit(`share-token:${token}`, 60, 60_000)) {
    return Response.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return Response.json({ error: "Invalid request" }, { status: 400 });
  }

  const tokenHash = hashToken(token);
  const [head] = await db
    .select({ workspaceId: submissions.workspaceId })
    .from(submissions)
    .where(and(eq(submissions.id, body.submissionId), eq(submissions.tokenHash, tokenHash)))
    .limit(1);
  if (!head) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    const result = await withWorkspace(db, head.workspaceId, (tx) =>
      applyVerdict(tx, {
        workspaceId: head.workspaceId,
        submissionId: body.submissionId,
        tokenHash,
        verdict: body.verdict,
        comment: body.comment?.trim() || null
      })
    );
    if (!result) {
      return Response.json({ error: "This submission can no longer be updated" }, { status: 409 });
    }
    return Response.json({ ok: true, verdict: body.verdict });
  } catch (err) {
    console.error("[share verdict] failed:", err);
    return Response.json({ error: "Failed to record verdict" }, { status: 500 });
  }
}
