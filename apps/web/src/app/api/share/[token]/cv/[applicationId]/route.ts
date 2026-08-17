import { clientIp, rateLimit } from "@/server/rate-limit";
import { loadShareCv } from "@/server/share";
import { getObject, isStorageConfigured } from "@/server/storage";

/**
 * Serve the submitted candidate's CV to the client via the share token.
 * Resolves the CV strictly through the token + application pair, then streams
 * the object through the app (M15 fix: the storage endpoint is internal-only
 * in production, so a presigned redirect never reaches the browser). No
 * session required.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; applicationId: string }> }
) {
  const { token, applicationId } = await params;
  if (!rateLimit(`share-cv:${clientIp(req)}`, 60, 60_000)) {
    return new Response("Too many requests", { status: 429 });
  }
  if (!isStorageConfigured()) {
    return new Response("Storage not configured", { status: 503 });
  }
  const cv = await loadShareCv(token, applicationId);
  if (!cv) return new Response("Not found", { status: 404 });

  try {
    const { stream, contentType, contentLength } = await getObject(cv.objectKey);
    const headers = new Headers({
      "Content-Type": contentType ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${cv.filename.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store"
    });
    if (contentLength) headers.set("Content-Length", String(contentLength));
    return new Response(stream, { headers });
  } catch (err) {
    console.error("[share-cv] download failed:", err);
    return new Response("Download failed", { status: 500 });
  }
}
