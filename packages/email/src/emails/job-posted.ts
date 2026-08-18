/**
 * Team-wide notification when a new job opening is posted (M15). Presentation
 * only - the job facts and the deep link are produced by the jobs router and
 * passed in unchanged. Includes the client call summary captured at intake so
 * the whole team sees the client's brief without opening the app.
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

export interface JobPostedEmailInput {
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

/** "permanent" -> "Permanent", "on_hold" -> "On hold". */
function label(value: string): string {
  const words = value.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function renderJobPostedEmail(input: JobPostedEmailInput): RenderedEmail {
  const subject = `New job opening: ${input.jobTitle} (${input.companyName})`;

  const rows: Array<{ label: string; value: string }> = [
    { label: "Job opening", value: `${input.jobTitle} (${input.jobHumanId})` },
    { label: "Client", value: input.companyName },
    ...(input.location ? [{ label: "Location", value: input.location }] : []),
    { label: "Type", value: `${label(input.employmentType)} / ${label(input.workMode)}` },
    { label: "Positions", value: String(input.positions) }
  ];

  const summaryBlock = input.clientCallSummary
    ? paragraph(strong("Client call summary")) +
      subtle(escapeHtml(input.clientCallSummary).replace(/\r?\n/g, "<br />"))
    : "";

  const content =
    eyebrow("New job opening") +
    heading(input.jobTitle) +
    paragraph(
      `${strong(input.postedByName)} posted a new job opening for ${strong(input.companyName)}.`
    ) +
    infoCard(rows) +
    summaryBlock +
    button({ href: input.jobUrl, label: "View Job Opening" }) +
    fallbackLink(input.jobUrl);

  const html = layout({
    previewText: `${input.postedByName} posted ${input.jobTitle} for ${input.companyName}.`,
    contentHtml: content
  });

  const text = [
    `New job opening: ${input.jobTitle} (${input.jobHumanId})`,
    "",
    `${input.postedByName} posted a new job opening for ${input.companyName}.`,
    `Client: ${input.companyName}`,
    ...(input.location ? [`Location: ${input.location}`] : []),
    `Type: ${label(input.employmentType)} / ${label(input.workMode)}`,
    `Positions: ${input.positions}`,
    ...(input.clientCallSummary ? ["", "Client call summary:", input.clientCallSummary] : []),
    "",
    "View the job opening:",
    input.jobUrl
  ].join("\n");

  return { subject, html, text };
}
