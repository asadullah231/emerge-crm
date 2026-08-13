import { createHash, randomBytes } from "node:crypto";

/** Opaque bearer token handed to the client (cookie / email link). */
export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored; a DB leak never exposes usable tokens. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
