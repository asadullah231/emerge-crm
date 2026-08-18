/**
 * Email sent when someone is @mentioned in a note (M16). Presentation only -
 * the note body is truncated/escaped by the caller and the entity link is
 * built server-side, so this file just renders the branded HTML + a plain-text
 * fallback. Runs in addition to the in-app notification bell.
 */
import {
  button,
  escapeHtml,
  eyebrow,
  fallbackLink,
  heading,
  infoCard,
  layout,
  paragraph,
  strong,
  subtle
} from "../render.js";
import type { RenderedEmail } from "./invitation.js";

export interface MentionEmailInput {
  authorName: string;
  entityLabel: string;
  /** Human label for the entity type (e.g. "Candidate", "Job Opening"). */
  entityKind: string;
  entityUrl: string;
  /** Full note body; caller trims/escapes appropriately. */
  noteBodyPreview: string;
}

/** Trim to `max` chars, snapping at a word boundary and adding an ellipsis. */
function trim(body: string, max = 240): string {
  const clean = body.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const idx = cut.lastIndexOf(" ");
  return (idx > 60 ? cut.slice(0, idx) : cut).trimEnd() + "…";
}

export function renderMentionEmail(input: MentionEmailInput): RenderedEmail {
  const preview = trim(input.noteBodyPreview);
  const subject = `${input.authorName} mentioned you on ${input.entityLabel}`;

  const content =
    eyebrow("Mention") +
    heading("You were mentioned") +
    paragraph(`${strong(input.authorName)} tagged you in a note on ${strong(input.entityLabel)}.`) +
    infoCard([
      { label: input.entityKind, value: input.entityLabel },
      { label: "From", value: input.authorName }
    ]) +
    subtle(escapeHtml(preview).replace(/\r?\n/g, "<br />")) +
    button({ href: input.entityUrl, label: "Open Record" }) +
    fallbackLink(input.entityUrl);

  const html = layout({
    previewText: `${input.authorName} mentioned you on ${input.entityLabel}.`,
    contentHtml: content
  });

  const text = [
    `${input.authorName} mentioned you on ${input.entityLabel}.`,
    "",
    `${input.entityKind}: ${input.entityLabel}`,
    `From: ${input.authorName}`,
    "",
    preview,
    "",
    "Open the record:",
    input.entityUrl
  ].join("\n");

  return { subject, html, text };
}
