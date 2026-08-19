/**
 * Reminder sent to interviewers shortly before an interview starts (M17c).
 * Presentation only - the worker sweep decides who gets it and when; this file
 * just renders the branded HTML + a plain-text fallback.
 */
import {
  button,
  eyebrow,
  fallbackLink,
  heading,
  infoCard,
  layout,
  paragraph,
  strong
} from "../render.js";
import type { RenderedEmail } from "./invitation.js";

export interface InterviewReminderEmailInput {
  candidateName: string;
  jobTitle: string;
  typeLabel: string;
  /** Already formatted for display (the worker formats in UTC or locale). */
  scheduledAtText: string;
  durationMins: number;
  location: string | null;
  meetingLink: string | null;
  interviewUrl: string;
}

export function renderInterviewReminderEmail(input: InterviewReminderEmailInput): RenderedEmail {
  const subject = `Reminder: ${input.typeLabel} interview with ${input.candidateName} at ${input.scheduledAtText}`;

  const rows = [
    { label: "Candidate", value: input.candidateName },
    { label: "Job", value: input.jobTitle },
    { label: "Type", value: input.typeLabel },
    { label: "When", value: input.scheduledAtText },
    { label: "Duration", value: `${input.durationMins} minutes` }
  ];
  if (input.location) rows.push({ label: "Location", value: input.location });

  const content =
    eyebrow("Interview reminder") +
    heading("Starting soon") +
    paragraph(
      `Your ${strong(input.typeLabel)} interview with ${strong(input.candidateName)} for ${strong(
        input.jobTitle
      )} starts at ${strong(input.scheduledAtText)}.`
    ) +
    infoCard(rows) +
    button({
      href: input.meetingLink ?? input.interviewUrl,
      label: input.meetingLink ? "Join Meeting" : "Open Application"
    }) +
    fallbackLink(input.meetingLink ?? input.interviewUrl);

  const html = layout({
    previewText: `Interview with ${input.candidateName} starts at ${input.scheduledAtText}.`,
    contentHtml: content
  });

  const text = [
    `Reminder: your ${input.typeLabel} interview with ${input.candidateName} for ${input.jobTitle} starts at ${input.scheduledAtText}.`,
    "",
    `Candidate: ${input.candidateName}`,
    `Job: ${input.jobTitle}`,
    `Duration: ${input.durationMins} minutes`,
    ...(input.location ? [`Location: ${input.location}`] : []),
    ...(input.meetingLink ? ["", "Join:", input.meetingLink] : []),
    "",
    "Open the application:",
    input.interviewUrl
  ].join("\n");

  return { subject, html, text };
}
