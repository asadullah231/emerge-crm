/**
 * Email sent to the task's creator when the assignee marks it done (UP-07).
 * Presentation only - the caller resolves names, the optional linked-record
 * label and the deep link. Runs in addition to the in-app notification bell.
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

export interface TaskCompletedEmailInput {
  completerName: string;
  taskSubject: string;
  /** Display label of the linked record (e.g. "Jane Doe (CAND-0123)"), if any. */
  entityLabel: string | null;
  taskUrl: string;
}

export function renderTaskCompletedEmail(input: TaskCompletedEmailInput): RenderedEmail {
  const subject = `${input.completerName} completed a task: ${input.taskSubject}`;

  const rows = [{ label: "Task", value: input.taskSubject }];
  if (input.entityLabel) rows.push({ label: "Related to", value: input.entityLabel });
  rows.push({ label: "Completed by", value: input.completerName });

  const content =
    eyebrow("Task done") +
    heading("A task was completed") +
    paragraph(`${strong(input.completerName)} marked ${strong(input.taskSubject)} as done.`) +
    infoCard(rows) +
    button({ href: input.taskUrl, label: "Open Tasks" }) +
    fallbackLink(input.taskUrl);

  const html = layout({
    previewText: `${input.completerName} completed a task: ${input.taskSubject}`,
    contentHtml: content
  });

  const text = [
    `${input.completerName} completed a task.`,
    "",
    `Task: ${input.taskSubject}`,
    ...(input.entityLabel ? [`Related to: ${input.entityLabel}`] : []),
    `Completed by: ${input.completerName}`,
    "",
    "Open your tasks:",
    input.taskUrl
  ].join("\n");

  return { subject, html, text };
}
