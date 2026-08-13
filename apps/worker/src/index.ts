import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { APP_NAME, APP_VERSION } from "@emerge/core";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

const QUEUE_NAME = "system";

const queue = new Queue(QUEUE_NAME, { connection });

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name === "heartbeat") {
      console.log(`[worker] heartbeat ok (${APP_NAME} v${APP_VERSION})`);
    }
  },
  { connection }
);

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.name ?? "unknown"} failed:`, err.message);
});

// Repeatable heartbeat proves the queue infrastructure end to end.
await queue.upsertJobScheduler("heartbeat-scheduler", { every: 60_000 }, { name: "heartbeat" });

console.log(`[worker] started, queue "${QUEUE_NAME}" on ${redisUrl}`);

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, shutting down...`);
  await worker.close();
  await queue.close();
  connection.disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
