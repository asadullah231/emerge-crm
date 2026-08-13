import { Queue } from "bullmq";

export type EmailJob =
  | { type: "password-reset"; to: string; resetUrl: string }
  | { type: "invitation"; to: string; workspaceName: string; inviterName: string; acceptUrl: string };

// The worker app consumes this queue and does the actual SMTP delivery.
const globalForQueue = globalThis as unknown as { emailQueue?: Queue<EmailJob> };

function createQueue() {
  return new Queue<EmailJob>("email", {
    connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500
    }
  });
}

export function enqueueEmail(job: EmailJob): Promise<unknown> {
  const queue = (globalForQueue.emailQueue ??= createQueue());
  return queue.add(job.type, job);
}
