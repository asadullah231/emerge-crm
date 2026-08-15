/**
 * Password-reset email. Presentation only - the reset token/URL and its 1-hour
 * expiry are produced by the auth logic and passed in unchanged. Included here
 * to prove the design system is reusable across email types.
 */
import { company } from "../tokens.js";
import { button, eyebrow, fallbackLink, heading, layout, paragraph, subtle } from "../render.js";
import type { RenderedEmail } from "./invitation.js";

export interface PasswordResetEmailInput {
  resetUrl: string;
  /** Matches the token TTL set by the auth logic (default 1 hour). */
  expiresInHours?: number;
}

export function renderPasswordResetEmail(input: PasswordResetEmailInput): RenderedEmail {
  const expiresInHours = input.expiresInHours ?? 1;
  const subject = `Reset your ${company.product} password`;

  const content =
    eyebrow("Security") +
    heading("Reset your password") +
    paragraph(
      `We received a request to reset the password for your ${company.product} account. Click the button below to choose a new one.`
    ) +
    button({ href: input.resetUrl, label: "Reset Password" }) +
    subtle(
      `This link expires in <strong style="color:inherit;">${expiresInHours} hour${
        expiresInHours === 1 ? "" : "s"
      }</strong>. Didn't request this? You can safely ignore this email. Your password won't change.`
    ) +
    fallbackLink(input.resetUrl);

  const html = layout({
    previewText: `Reset the password for your ${company.product} account. This link expires in ${expiresInHours} hour${
      expiresInHours === 1 ? "" : "s"
    }.`,
    contentHtml: content
  });

  const text = [
    `Reset your ${company.product} password.`,
    "",
    "We received a request to reset your password. Use the link below to choose a new one:",
    input.resetUrl,
    "",
    `This link expires in ${expiresInHours} hour${expiresInHours === 1 ? "" : "s"}.`,
    "If you didn't request this, you can safely ignore this email.",
    "",
    `${company.product}`,
    company.domain
  ].join("\n");

  return { subject, html, text };
}
