import { eq } from "drizzle-orm";
import { apiKeys, withWorkspace, type Transaction } from "@emerge/db";
import { hashApiKey, type ApiScope } from "./api-keys";
import { db } from "./db";
import { clientIp, rateLimit } from "./rate-limit";

/**
 * Auth + plumbing for the public REST API (M19). Keys arrive as
 * "Authorization: Bearer emk_...", are matched by sha256 hash, must not be
 * revoked and must carry the required scope. Every authenticated call runs
 * inside the key's workspace RLS transaction.
 */

export type PublicApiAuth = { workspaceId: string; keyId: string; scopes: string[] };

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function apiError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

export async function authenticate(
  req: Request,
  requiredScope: ApiScope
): Promise<PublicApiAuth | Response> {
  if (!rateLimit(`api:${clientIp(req)}`, 120, 60_000)) {
    return apiError(429, "Too many requests");
  }
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(emk_[a-f0-9]{40})$/i.exec(header.trim());
  if (!match) return apiError(401, "Missing or malformed API key");

  const [key] = await db
    .select({
      id: apiKeys.id,
      workspaceId: apiKeys.workspaceId,
      scopes: apiKeys.scopes,
      revokedAt: apiKeys.revokedAt
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hashApiKey(match[1]!)));
  if (!key || key.revokedAt) return apiError(401, "Invalid or revoked API key");
  if (!key.scopes.includes(requiredScope)) {
    return apiError(403, `This key does not have the ${requiredScope} scope`);
  }

  // Fire-and-forget usage stamp; never blocks the request.
  void db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .catch(() => {});

  return { workspaceId: key.workspaceId, keyId: key.id, scopes: key.scopes };
}

/** Run `fn` inside the authenticated workspace's RLS transaction. */
export async function withApiWorkspace<T>(
  auth: PublicApiAuth,
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  return withWorkspace(db, auth.workspaceId, fn);
}

/** Shared paging: ?page=1&per_page=50 (max 200). */
export function paging(req: Request): { page: number; perPage: number; offset: number } {
  const url = new URL(req.url);
  const page = Math.max(1, Number.parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
  const perPage = Math.min(
    200,
    Math.max(1, Number.parseInt(url.searchParams.get("per_page") ?? "50", 10) || 50)
  );
  return { page, perPage, offset: (page - 1) * perPage };
}
