import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { APP_NAME, APP_VERSION } from "@emerge/core";
import { createDb } from "@emerge/db";
import { startEmailWorker } from "./email";
import { expireOverdueOffers } from "./offers/expiry";
import { startParseWorker } from "./parse/worker";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const QUEUE_NAME = "system";

const queue = new Queue(QUEUE_NAME, { connection });
const db = createDb();

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name === "heartbeat") {
      console.log(`[worker] heartbeat ok (${APP_NAME} v${APP_VERSION})`);
    } else if (job.name === "expire-offers") {
      const n = await expireOverdueOffers(db);
      if (n > 0) console.log(`[worker] expired ${n} overdue offer(s)`);
    }
  },
  { connection }
);

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.name ?? "unknown"} failed:`, err.message);
});

// Repeatable heartbeat proves the queue infrastructure end to end.
await queue.upsertJobScheduler("heartbeat-scheduler", { every: 60_000 }, { name: "heartbeat" });

// Offer expiry sweep: flag sent offers past their expiry (M12).
await queue.upsertJobScheduler(
  "expire-offers-scheduler",
  { every: 5 * 60_000 },
  { name: "expire-offers" }
);

const emailWorker = startEmailWorker(connection);
const parseWorker = startParseWorker(connection);

console.log(`[worker] started, queues "${QUEUE_NAME}" + "email" + "parse" on ${redisUrl}`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, shutting down...`);
  await worker.close();
  await emailWorker.close();
  await parseWorker.close();
  await queue.close();
  await db.close();
  connection.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
