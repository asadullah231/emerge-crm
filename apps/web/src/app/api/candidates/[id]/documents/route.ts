import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { attachments, candidates, withWorkspace } from "@emerge/db";
import { getCurrentSession } from "@/server/auth/current";
import { db } from "@/server/db";
import { roleAtLeast } from "@/server/trpc";
import {
  ALLOWED_UPLOAD_MIME,
  MAX_UPLOAD_BYTES,
  isStorageConfigured,
  putObject
} from "@/server/storage";

/**
 * Multipart CV/document upload for a candidate. Kept out of tRPC because tRPC's
 * JSON transport does not carry binary bodies. The file is validated, stored in
 * S3 (server-proxied, so no browser-to-storage CORS), and recorded as an
 * attachment row inside the workspace RLS transaction.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: candidateId } = await params;
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
  if (file.size === 0) {
    return Response.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit` },
      { status: 413 }
    );
  }
  if (!ALLOWED_UPLOAD_MIME[file.type]) {
    return Response.json(
      { error: "Unsupported file type. Allowed: PDF, DOC, DOCX, RTF, TXT" },
      { status: 415 }
    );
  }
  const kindParam = form.get("kind");
  const kind = kindParam === "cv" ? "cv" : "other";

  try {
    const result = await withWorkspace(db, session.workspaceId, async (tx) => {
      const [candidate] = await tx
        .select({ id: candidates.id })
        .from(candidates)
        .where(and(eq(candidates.id, candidateId), isNull(candidates.deletedAt)));
      if (!candidate) return { status: 404 as const, error: "Candidate not found" };

      const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 200);
      const objectKey = `workspaces/${session.workspaceId}/candidates/${candidateId}/${randomUUID()}-${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const bucket = await putObject(objectKey, buffer, file.type);

      const [row] = await tx
        .insert(attachments)
        .values({
          workspaceId: session.workspaceId,
          entityType: "candidate",
          entityId: candidateId,
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
