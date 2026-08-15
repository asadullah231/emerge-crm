import { createHash, randomUUID } from "node:crypto";
import { parseJobs, withWorkspace } from "@emerge/db";
import { getCurrentSession } from "@/server/auth/current";
import { db } from "@/server/db";
import { enqueueParse } from "@/server/parse-queue";
import { roleAtLeast } from "@/server/trpc";
import { checkUploadConstraints, isStorageConfigured, putObject } from "@/server/storage";

/**
 * Bulk CV upload for parsing. Accepts one or many files (multipart), stores each
 * in S3, creates a queued parse_jobs row, and enqueues a parse job for the
 * worker. Kept out of tRPC because tRPC's JSON transport does not carry binary.
 */
export async function POST(req: Request) {
  const session = await getCurrentSession();
  if (!session) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (!roleAtLeast(session.role, "recruiter")) {
    return Response.json({ error: "Read-only members cannot upload" }, { status: 403 });
  }
  if (!isStorageConfigured()) {
    return Response.json({ error: "Storage is not configured" }, { status: 503 });
  }

  const form = await req.formData();
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  if (files.length === 0) return Response.json({ error: "No files provided" }, { status: 400 });
  if (files.length > 50) {
    return Response.json({ error: "Up to 50 files per upload" }, { status: 400 });
  }

  const accepted: Array<{ id: string; filename: string; status: string }> = [];
  const rejected: Array<{ filename: string; error: string }> = [];

  for (const file of files) {
    const check = checkUploadConstraints(file.type, file.size);
    if (!check.ok) {
      rejected.push({ filename: file.name, error: check.error });
      continue;
    }
    const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(0, 200) || "cv";
    const buffer = Buffer.from(await file.arrayBuffer());
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const objectKey = `workspaces/${session.workspaceId}/parse/${randomUUID()}-${safeName}`;

    try {
      const bucket = await putObject(objectKey, buffer, file.type);
      const [row] = await withWorkspace(db, session.workspaceId, (tx) =>
        tx
          .insert(parseJobs)
          .values({
            workspaceId: session.workspaceId,
            status: "queued",
            bucket,
            objectKey,
            filename: safeName,
            mime: file.type,
            size: file.size,
            sha256,
            uploadedById: session.user.id
          })
          .returning({ id: parseJobs.id, filename: parseJobs.filename, status: parseJobs.status })
      );
      if (!row) throw new Error("insert failed");
      await enqueueParse({ parseJobId: row.id, workspaceId: session.workspaceId });
      accepted.push(row);
    } catch (err) {
      console.error("[parse-upload] failed:", err);
      rejected.push({ filename: file.name, error: "Upload failed" });
    }
  }

  return Response.json({ accepted, rejected }, { status: accepted.length ? 200 : 400 });
}
