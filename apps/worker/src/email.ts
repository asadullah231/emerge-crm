import { Worker } from "bullmq";
import type IORedis from "ioredis";
import nodemailer from "nodemailer";
import { renderInvitationEmail, renderPasswordResetEmail } from "@emerge/email";

export type EmailJob =
  | { type: "password-reset"; to: string; resetUrl: string }
  | {
      type: "invitation";
      to: string;
      workspaceName: string;
      inviterName: string;
      acceptUrl: string;
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
 * Presentation only — delegates to the shared @emerge/email design system.
 * The auth/invitation logic still produces the URLs, tokens and expiries; this
 * just renders them into the branded HTML + a plain-text fallback.
 */
function renderEmail(job: EmailJob): { subject: string; html: string; text: string } {
  switch (job.type) {
    case "password-reset":
      return renderPasswordResetEmail({ resetUrl: job.resetUrl });
    case "invitation":
      return renderInvitationEmail({
        inviterName: job.inviterName,
        workspaceName: job.workspaceName,
        acceptUrl: job.acceptUrl
      });
  }
}

export function startEmailWorker(connection: IORedis): Worker<EmailJob> {
  const worker = new Worker<EmailJob>(
    "email",
    async (job) => {
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
