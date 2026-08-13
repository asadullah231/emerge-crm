import { Worker } from "bullmq";
import type IORedis from "ioredis";
import nodemailer from "nodemailer";

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

function renderEmail(job: EmailJob): { subject: string; text: string } {
  switch (job.type) {
    case "password-reset":
      return {
        subject: "Reset your Emerge CRM password",
        text: [
          "You requested a password reset for your Emerge CRM account.",
          "",
          `Reset your password: ${job.resetUrl}`,
          "",
          "This link expires in 1 hour. If you did not request this, you can ignore this email."
        ].join("\n")
      };
    case "invitation":
      return {
        subject: `${job.inviterName} invited you to ${job.workspaceName} on Emerge CRM`,
        text: [
          `${job.inviterName} invited you to join the workspace "${job.workspaceName}" on Emerge CRM.`,
          "",
          `Accept the invitation: ${job.acceptUrl}`,
          "",
          "This invitation expires in 7 days."
        ].join("\n")
      };
  }
}

export function startEmailWorker(connection: IORedis): Worker<EmailJob> {
  const worker = new Worker<EmailJob>(
    "email",
    async (job) => {
      const { subject, text } = renderEmail(job.data);
      await transporter.sendMail({ from: FROM, to: job.data.to, subject, text });
      console.log(`[worker] email "${job.data.type}" sent to ${job.data.to}`);
    },
    { connection }
  );
  worker.on("failed", (job, err) => {
    console.error(`[worker] email job ${job?.id ?? "unknown"} failed:`, err.message);
  });
  return worker;
}
