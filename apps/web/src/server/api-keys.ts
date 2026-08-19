import { createHash, randomBytes } from "node:crypto";

/**
 * Public API key helpers (M19). Keys look like "emk_<40 hex chars>"; only the
 * sha256 hash is stored, the plaintext is shown once at creation.
 */

export const API_SCOPES = [
  "read:candidates",
  "read:jobs",
  "read:applications",
  "write:candidates"
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `emk_${randomBytes(20).toString("hex")}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
