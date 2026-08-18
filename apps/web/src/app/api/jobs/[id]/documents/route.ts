import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { attachments, jobs, withWorkspace } from "@emerge/db";
import { getCurrentSession } from "@/server/auth/current";
import { db } from "@/server/db";
import { roleAtLeast } from "@/server/trpc";
import { checkUploadConstraints, isStorageConfigured, putObject } from "@/server/storage";

/** Attachment kinds a job document upload may carry (M15). */
const JOB_KINDS = ["job_description", "client_meeting_summary", "other"] as const;
type JobKind = (typeof JOB_KINDS)[number];

/**
 * Multipart document upload for a job opening (M15): the job description and
 * the client meeting summary, plus generic documents. Kept out of tRPC because
 * tRPC's JSON transport does not carry binary bodies. The file is validated,
 * stored in S3 (server-proxied, so no browser-to-storage CORS), and recorded as
 * an attachment row inside the workspace RLS transaction.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await params;
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!roleAtLeast(session.role, "recruiter")) {
    return Response.json({ error: "Read-only members cannot upload" }, { status: 403 });
  }
  if (!isStorageConfigured()) {
    return Response.json({ error: "Storage is not configured" }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }
  const check = checkUploadConstraints(file.type, file.size);
  if (!check.ok) {
    return Response.json({ error: check.error }, { status: check.status });
  }
  const kindParam = form.get("kind");
  const kind: JobKind = JOB_KINDS.includes(kindParam as JobKind) ? (kindParam as JobKind) : "other";

  try {
    const result = await withWorkspace(db, session.workspaceId, async (tx) => {
      const [job] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.id, jobId), isNull(jobs.deletedAt)));
      if (!job) return { status: 404 as const, error: "Job not found" };

      const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 200);
      const objectKey = `workspaces/${session.workspaceId}/jobs/${jobId}/${randomUUID()}-${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const bucket = await putObject(objectKey, buffer, file.type);

      const [row] = await tx
        .insert(attachments)
        .values({
          workspaceId: session.workspaceId,
          entityType: "job",
          entityId: jobId,
          kind,
          bucket,
          objectKey,
          filename: safeName,
          mime: file.type,
          size: file.size,
          uploadedById: session.user.id
        })
        .returning({
          id: attachments.id,
          kind: attachments.kind,
          filename: attachments.filename,
          mime: attachments.mime,
          size: attachments.size,
          createdAt: attachments.createdAt
        });
      return { status: 200 as const, attachment: row };
    });

    if (result.status !== 200) {
      return Response.json({ error: result.error }, { status: result.status });
    }
    return Response.json({ attachment: result.attachment }, { status: 200 });
  } catch (err) {
    console.error("[upload] failed:", err);
    return Response.json({ error: "Upload failed" }, { status: 500 });
  }
}
