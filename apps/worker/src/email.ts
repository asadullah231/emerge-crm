import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import type IORedis from "ioredis";
import nodemailer from "nodemailer";
import { emails, withWorkspace, type Database } from "@emerge/db";
import {
  renderInvitationEmail,
  renderJobPostedEmail,
  renderPasswordResetEmail
} from "@emerge/email";

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
      /** A pre-rendered email sent from a record (M13); update the row on send. */
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

// MailHog in dev/compose; any SMTP provider in production.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST ?? "localhost",
  port: Number(process.env.SMTP_PORT ?? 1025),
  secure: process.env.SMTP_SECURE === "1",
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined
});

const FROM = process.env.SMTP_FROM ?? "Emerge CRM <no-reply@emerge.local>";

/**
 * Send a scheduled report as an email with a CSV attachment (M14). Called
 * directly by the delivery sweep, which already runs in the worker process, so
 * it uses the shared transporter rather than a round-trip through the queue.
 */
export async function sendReportEmail(opts: {
  to: string[];
  subject: string;
  html: string;
  text: string;
  csv: { filename: string; content: string };
}): Promise<void> {
  await transporter.sendMail({
    from: FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: [
      { filename: opts.csv.filename, content: opts.csv.content, contentType: "text/csv" }
    ]
  });
}

/**
 * Presentation only - delegates to the shared @emerge/email design system.
 * The auth/invitation logic still produces the URLs, tokens and expiries; this
 * just renders them into the branded HTML + a plain-text fallback.
 */
function renderEmail(job: Exclude<EmailJob, { type: "record" }>): {
  subject: string;
  html: string;
  text: string;
} {
  switch (job.type) {
    case "password-reset":
      return renderPasswordResetEmail({ resetUrl: job.resetUrl });
    case "invitation":
      return renderInvitationEmail({
        inviterName: job.inviterName,
        workspaceName: job.workspaceName,
        acceptUrl: job.acceptUrl
      });
    case "job-posted":
      return renderJobPostedEmail({
        jobTitle: job.jobTitle,
        jobHumanId: job.jobHumanId,
        companyName: job.companyName,
        location: job.location,
        employmentType: job.employmentType,
        workMode: job.workMode,
        positions: job.positions,
        postedByName: job.postedByName,
        clientCallSummary: job.clientCallSummary,
        jobUrl: job.jobUrl
      });
  }
}

export function startEmailWorker(connection: IORedis, db: Database): Worker<EmailJob> {
  const worker = new Worker<EmailJob>(
    "email",
    async (job) => {
      // Record emails carry their own rendered content and update the emails row.
      if (job.data.type === "record") {
        const data = job.data;
        try {
          const info = await transporter.sendMail({
            from: FROM,
            to: data.to,
            cc: data.cc,
            replyTo: data.replyTo,
            subject: data.subject,
            html: data.html,
            text: data.text
          });
          await withWorkspace(db, data.workspaceId, (tx) =>
            tx
              .update(emails)
              .set({
                status: "sent",
                sentAt: new Date(),
                messageId: info.messageId ?? null,
                providerId: (info as { id?: string }).id ?? info.messageId ?? null,
                error: null,
                updatedAt: new Date()
              })
              .where(eq(emails.id, data.emailId))
          );
          console.log(`[worker] record email sent to ${data.to.join(", ")} (${data.emailId})`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          await withWorkspace(db, data.workspaceId, (tx) =>
            tx
              .update(emails)
              .set({ status: "failed", error: message.slice(0, 1000), updatedAt: new Date() })
              .where(eq(emails.id, data.emailId))
          );
          throw err;
        }
        return;
      }

      const { subject, html, text } = renderEmail(job.data);
      await transporter.sendMail({ from: FROM, to: job.data.to, subject, html, text });
      console.log(`[worker] email "${job.data.type}" sent to ${job.data.to}`);
    },
    { connection }
  );
  worker.on("failed", (job, err) => {
    console.error(`[worker] email job ${job?.id ?? "unknown"} failed:`, err.message);
  });
  return worker;
}
