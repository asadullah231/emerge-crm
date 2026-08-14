import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Allowed CV/document types and the per-file size cap (shared with the client). */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB
export const ALLOWED_UPLOAD_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/rtf": "rtf",
  "text/plain": "txt"
};

/** Pure upload gate shared by the route handler and its tests. */
export function checkUploadConstraints(
  mime: string,
  size: number
): { ok: true } | { ok: false; status: number; error: string } {
  if (size <= 0) return { ok: false, status: 400, error: "File is empty" };
  if (size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      status: 413,
      error: `File exceeds the ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit`
    };
  }
  if (!ALLOWED_UPLOAD_MIME[mime]) {
    return {
      ok: false,
      status: 415,
      error: "Unsupported file type. Allowed: PDF, DOC, DOCX, RTF, TXT"
    };
  }
  return { ok: true };
}

type StorageConfig = {
  endpoint: string;
  region: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
};

function readConfig(): StorageConfig | null {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;
  const bucket = process.env.S3_BUCKET;
  if (!endpoint || !accessKey || !secretKey || !bucket) return null;
  return { endpoint, region: process.env.S3_REGION ?? "us-east-1", accessKey, secretKey, bucket };
}

export function isStorageConfigured(): boolean {
  return readConfig() !== null;
}

let cachedClient: { client: S3Client; bucket: string } | null = null;

function getClient(): { client: S3Client; bucket: string } {
  if (cachedClient) return cachedClient;
  const config = readConfig();
  if (!config) throw new Error("Storage is not configured (S3_* env missing)");
  const client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.accessKey, secretAccessKey: config.secretKey },
    // MinIO and most self-hosted S3 need path-style addressing.
    forcePathStyle: true
  });
  cachedClient = { client, bucket: config.bucket };
  return cachedClient;
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const { client, bucket } = getClient();
  await client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType })
  );
  return bucket;
}

/**
 * Short-lived presigned GET URL that forces a download with the original
 * filename. Used by the download route handler as a redirect target.
 */
export async function getPresignedDownloadUrl(
  key: string,
  filename: string,
  expiresInSeconds = 300
): Promise<string> {
  const { client, bucket } = getClient();
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename.replace(/"/g, "")}"`
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

export async function deleteObject(key: string): Promise<void> {
  const { client, bucket } = getClient();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
