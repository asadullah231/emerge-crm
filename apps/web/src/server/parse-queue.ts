import { Queue } from "bullmq";

/** Enqueued on CV upload; the worker app parses the file and fills parse_jobs. */
export type ParseJobData = { parseJobId: string; workspaceId: string };

const globalForQueue = globalThis as unknown as { parseQueue?: Queue<ParseJobData> };

function createQueue() {
  return new Queue<ParseJobData>("parse", {
    connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 200,
      removeOnFail: 1000
    }
  });
}

export function enqueueParse(job: ParseJobData): Promise<unknown> {
  const queue = (globalForQueue.parseQueue ??= createQueue());
  return queue.add("parse", job);
}
