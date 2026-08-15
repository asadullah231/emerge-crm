/** Read an object's bytes from MinIO/S3 (the uploaded CV) for parsing. */
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

let cached: S3Client | null = null;

function client(): S3Client {
  if (cached) return cached;
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY;
  const secretAccessKey = process.env.S3_SECRET_KEY;
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error("S3_* not configured");
  cached = new S3Client({
    endpoint,
    region: process.env.S3_REGION ?? "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true
  });
  return cached;
}

export async function getObjectBytes(bucket: string, key: string): Promise<Buffer> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!res.Body) throw new Error(`empty object ${bucket}/${key}`);
  return Buffer.from(await res.Body.transformToByteArray());
}
