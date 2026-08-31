/**
 * Email sent when a task is assigned to a member (UP-06). Presentation only -
 * the caller resolves the assigner name, the optional linked-record label and
 * the deep link. Runs in addition to the in-app notification bell.
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

export interface TaskAssignedEmailInput {
  assignerName: string;
  taskSubject: string;
  /** Preformatted due date (e.g. "Mon, 1 Sep 2026"), if the task has one. */
  dueLabel: string | null;
  /** Display label of the linked record (e.g. "Jane Doe (CAND-0123)"), if any. */
  entityLabel: string | null;
  taskUrl: string;
}

export function renderTaskAssignedEmail(input: TaskAssignedEmailInput): RenderedEmail {
  const subject = `${input.assignerName} assigned you a task: ${input.taskSubject}`;

  const rows = [{ label: "Task", value: input.taskSubject }];
  if (input.dueLabel) rows.push({ label: "Due", value: input.dueLabel });
  if (input.entityLabel) rows.push({ label: "Related to", value: input.entityLabel });
  rows.push({ label: "From", value: input.assignerName });

  const content =
    eyebrow("Task") +
    heading("A task was assigned to you") +
    paragraph(`${strong(input.assignerName)} assigned you ${strong(input.taskSubject)}.`) +
    infoCard(rows) +
    (input.dueLabel ? subtle(`Due ${escapeHtml(input.dueLabel)}.`) : "") +
    button({ href: input.taskUrl, label: "Open Task" }) +
    fallbackLink(input.taskUrl);

  const html = layout({
    previewText: `${input.assignerName} assigned you a task: ${input.taskSubject}`,
    contentHtml: content
  });

  const text = [
    `${input.assignerName} assigned you a task.`,
    "",
    `Task: ${input.taskSubject}`,
    ...(input.dueLabel ? [`Due: ${input.dueLabel}`] : []),
    ...(input.entityLabel ? [`Related to: ${input.entityLabel}`] : []),
    `From: ${input.assignerName}`,
    "",
    "Open the task:",
    input.taskUrl
  ].join("\n");

  return { subject, html, text };
}
