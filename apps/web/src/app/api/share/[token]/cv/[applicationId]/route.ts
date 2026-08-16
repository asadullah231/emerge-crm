import { clientIp, rateLimit } from "@/server/rate-limit";
import { loadShareCv } from "@/server/share";
import { getPresignedDownloadUrl, isStorageConfigured } from "@/server/storage";

/**
 * Serve the submitted candidate's CV to the client via the share token. Resolves
 * the CV strictly through the token + application pair, then 302s to a
 * short-lived presigned URL. No session required.
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

  const url = await getPresignedDownloadUrl(cv.objectKey, cv.filename);
  return Response.redirect(url, 302);
}
