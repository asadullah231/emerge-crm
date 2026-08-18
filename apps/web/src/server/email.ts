import { Queue } from "bullmq";

export type EmailJob =
  | { type: "password-reset"; to: string; resetUrl: string }
  | {
      type: "invitation";
      to: string;
      workspaceName: string;
      inviterName: string;
      acceptUrl: string;
    }
  | {
      /** Team-wide heads-up when a new job opening is posted (M15). */
      type: "job-posted";
      to: string[];
      jobTitle: string;
      jobHumanId: string;
      companyName: string;
      location: string | null;
      employmentType: string;
      workMode: string;
      positions: number;
      postedByName: string;
      clientCallSummary: string | null;
      jobUrl: string;
    }
  | {
      /** A pre-rendered email sent from a record (M13). The worker delivers it
       * and updates the `emails` row (status/messageId) by id. */
      type: "record";
      emailId: string;
      workspaceId: string;
      to: string[];
      cc?: string[];
      replyTo?: string;
      subject: string;
      html: string;
      text: string;
    };

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
