import { NextResponse } from "next/server";
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import IORedis from "ioredis";
import { pingDatabase } from "@emerge/db";
import { summarizeHealth, type HealthCheck } from "@emerge/core";

export const dynamic = "force-dynamic";

async function timed(name: string, fn: () => Promise<void>): Promise<HealthCheck> {
  const start = Date.now();
  try {
    await fn();
    return { name, status: "ok", latencyMs: Date.now() - start };
  } catch (err) {
    return { name, status: "fail", error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET() {
  const checks = await Promise.all([
    timed("db", () => pingDatabase()),
    timed("redis", async () => {
      const redis = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
        connectTimeout: 5000,
        maxRetriesPerRequest: 1,
        lazyConnect: true
      });
      try {
        await redis.connect();
        await redis.ping();
      } finally {
        redis.disconnect();
      }
    }),
    timed("storage", async () => {
      const endpoint = process.env.S3_ENDPOINT;
      if (!endpoint) throw new Error("S3_ENDPOINT not set");
      const s3 = new S3Client({
        endpoint,
        region: process.env.S3_REGION ?? "us-east-1",
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY ?? "",
          secretAccessKey: process.env.S3_SECRET_KEY ?? ""
        }
      });
      await s3.send(new ListBucketsCommand({}));
    })
  ]);

  const summary = summarizeHealth(checks);
  return NextResponse.json(summary, { status: summary.status === "ok" ? 200 : 503 });
}
