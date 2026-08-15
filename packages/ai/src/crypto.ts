/**
 * AES-256-GCM for secrets at rest (workspace API keys). The master key comes
 * from ENCRYPTION_KEY: a 32-byte value as hex (64 chars) or base64, or any
 * string (hashed to 32 bytes). Ciphertext/iv/tag are stored base64; the key is
 * never persisted.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

function masterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY not set");
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, "hex");
  const b64 = Buffer.from(raw, "base64");
  if (b64.length === 32) return b64;
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  };
}

export function decryptSecret(enc: EncryptedSecret): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function last4(secret: string): string {
  return secret.length <= 4 ? secret : secret.slice(-4);
}
