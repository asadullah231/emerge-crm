/**
 * Tiny S3/MinIO putter for the attachment backfill. Deliberately separate from
 * the web app's storage helper (wrong dependency direction to import across the
 * app boundary). Reads the same S3_* env the web app + prod stack already use,
 * so migrated files land in the exact bucket the CRM downloads from.
 */
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export interface S3Putter {
  bucket: string;
  put(key: string, body: Buffer, contentType: string): Promise<string>;
}

/** Build a putter from S3_* env, or null when storage is not configured. */
export function s3PutterFromEnv(env: NodeJS.ProcessEnv = process.env): S3Putter | null {
  const endpoint = env.S3_ENDPOINT;
  const accessKeyId = env.S3_ACCESS_KEY;
  const secretAccessKey = env.S3_SECRET_KEY;
  const bucket = env.S3_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  const client = new S3Client({
    endpoint,
    region: env.S3_REGION ?? "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    // MinIO and most self-hosted S3 need path-style addressing.
    forcePathStyle: true
  });
  return {
    bucket,
    async put(key, body, contentType) {
      await client.send(
        new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
      );
      return bucket;
    }
  };
}
