import { and, eq, isNull } from "drizzle-orm";
import { attachments, withWorkspace } from "@emerge/db";
import { getCurrentSession } from "@/server/auth/current";
import { db } from "@/server/db";
import { getObject, isStorageConfigured } from "@/server/storage";

/**
 * App-proxied attachment download (M15 fix). The storage endpoint (MinIO) is
 * only reachable inside the Docker network in production, so presigned URLs
 * are useless to a browser; instead the app streams the object itself, which
 * also keeps every download behind the session + workspace RLS.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) {
    return Response.json({ error: "Sign in required" }, { status: 401 });
  }
  if (!isStorageConfigured()) {
    return Response.json({ error: "Storage is not configured" }, { status: 503 });
  }

  const [file] = await withWorkspace(db, session.workspaceId, (tx) =>
    tx
      .select({
        objectKey: attachments.objectKey,
        filename: attachments.filename,
        mime: attachments.mime,
        size: attachments.size
      })
      .from(attachments)
      .where(and(eq(attachments.id, id), isNull(attachments.deletedAt)))
  );
  if (!file) return Response.json({ error: "File not found" }, { status: 404 });

  try {
    const { stream, contentType, contentLength } = await getObject(file.objectKey);
    const headers = new Headers({
      "Content-Type": contentType ?? file.mime ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store"
    });
    const length = contentLength ?? file.size;
    if (length) headers.set("Content-Length", String(length));
    return new Response(stream, { headers });
  } catch (err) {
    console.error("[download] failed:", err);
    return Response.json({ error: "Download failed" }, { status: 500 });
  }
}
