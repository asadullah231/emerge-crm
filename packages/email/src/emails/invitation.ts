/**
 * Workspace invitation email. Presentation only — the invite token, expiry and
 * accept URL are produced by the auth/invitation logic and passed in unchanged.
 */
import { company } from "../tokens.js";
import {
  button,
  eyebrow,
  fallbackLink,
  heading,
  infoCard,
  layout,
  paragraph,
  strong,
  subtle
} from "../render.js";

export interface InvitationEmailInput {
  inviterName: string;
  workspaceName: string;
  acceptUrl: string;
  /** Matches the invite TTL set by the invitation logic (default 7 days). */
  expiresInDays?: number;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const DESCRIPTION =
  "Emerge CRM is where the team runs its recruitment pipeline — candidates, jobs and client submissions in one shared place.";

export function renderInvitationEmail(input: InvitationEmailInput): RenderedEmail {
  const expiresInDays = input.expiresInDays ?? 7;
  const subject = `${input.inviterName} invited you to ${input.workspaceName} on ${company.product}`;

  const content =
    eyebrow("Invitation") +
    heading(`You've been invited to join ${company.product}`) +
    paragraph(
      `${strong(input.inviterName)} has invited you to collaborate in the ${strong(
        input.workspaceName
      )} workspace. ${DESCRIPTION}`
    ) +
    infoCard([
      { label: "Workspace", value: input.workspaceName },
      { label: "Invited by", value: input.inviterName }
    ]) +
    button({ href: input.acceptUrl, label: "Accept Invitation" }) +
    subtle(
      `This invitation expires in <strong style="color:inherit;">${expiresInDays} days</strong>. After that, ask ${escapeInline(
        input.inviterName
      )} to send a new one.`
    ) +
    fallbackLink(input.acceptUrl);

  const html = layout({
    previewText: `${input.inviterName} invited you to the ${input.workspaceName} workspace on ${company.product}.`,
    contentHtml: content
  });

  const text = [
    `You've been invited to join ${company.product}.`,
    "",
    `${input.inviterName} has invited you to collaborate in the "${input.workspaceName}" workspace.`,
    DESCRIPTION,
    "",
    `Accept your invitation:`,
    input.acceptUrl,
    "",
    `This invitation expires in ${expiresInDays} days.`,
    "",
    `— ${company.product}`,
    company.domain
  ].join("\n");

  return { subject, html, text };
}

/** Minimal escape for the one inline-in-subtle interpolation. */
function escapeInline(v: string): string {
  return v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
