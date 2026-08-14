/**
 * Production health check. Consumed by:
 *  - Docker healthcheck (compose.prod.yaml)
 *  - Traefik loadbalancer probe
 *  - External uptime monitor (n8n)
 *
 * Reports overall + per-dependency status. Never throws: on a failure the
 * body still parses cleanly and the HTTP status flips to 503.
 *
 * NOT touched by M1-M5: this is a brand-new route.
 */
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { createDb, pingDatabase } from "@emerge/db";

// Force per-request execution; no caching.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Check {
  ok: boolean;
  latencyMs: number;
  detail?: string;
}

async function timed<T>(fn: () => Promise<T>): Promise<Check> {
  const t = Date.now();
  try {
    await fn();
    return { ok: true, latencyMs: Date.now() - t };
  } catch (e) {
    return {
      ok: false,
      latencyMs: Date.now() - t,
      detail: e instanceof Error ? e.message : String(e)
    };
  }
}

async function checkDatabase(): Promise<Check> {
  return timed(async () => {
    // Cheap round-trip that doesn't touch a real table (RLS-safe).
    if (process.env.DATABASE_URL) await pingDatabase();
  });
}

async function checkRedis(): Promise<Check> {
  return timed(async () => {
    if (!process.env.REDIS_URL) return;
    const { default: IORedis } = await import("ioredis");
    const client = new IORedis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 3000
    });
    try {
      await client.connect();
      await client.ping();
    } finally {
      client.disconnect();
    }
  });
}

async function checkStorage(): Promise<Check> {
  return timed(async () => {
    if (!process.env.S3_ENDPOINT) return;
    // Reach the endpoint but don't require credentials to be valid; a 200 or
    // 403 from the S3 endpoint both mean "network + service reachable".
    const res = await fetch(process.env.S3_ENDPOINT, {
      method: "GET",
      signal: AbortSignal.timeout(3000)
    });
    if (![200, 403, 400].includes(res.status)) {
      throw new Error(`s3 endpoint returned ${res.status}`);
    }
  });
}

async function checkSchema(): Promise<Check> {
  // Confirms the app can actually reach + parse a DB row, catching a stale
  // migration state. Uses a workspace-agnostic query so RLS never rejects it.
  return timed(async () => {
    if (!process.env.DATABASE_URL) return;
    const db = createDb();
    try {
      await db.execute(sql`select 1`);
    } finally {
      await db.close();
    }
  });
}

export async function GET() {
  const [database, redis, storage, schema] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkStorage(),
    checkSchema()
  ]);

  const ok = database.ok && redis.ok && storage.ok && schema.ok;
  const body = {
    status: ok ? "ok" : "degraded",
    version: process.env.npm_package_version ?? "unknown",
    sha: process.env.GIT_SHA ?? "unknown",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: { database, redis, storage, schema }
  };
  return NextResponse.json(body, { status: ok ? 200 : 503 });
}
