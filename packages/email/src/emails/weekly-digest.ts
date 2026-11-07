/**
 * RD-5: Monday morning report emails. Two variants share one file:
 *  - recruiter digest: one member's own week against the weekly targets
 *  - team digest (admins): team totals, per-recruiter table and red flags
 * Presentation only - the worker computes every number.
 */
import { brand, fontStack } from "../tokens.js";
import {
  button,
  escapeHtml,
  eyebrow,
  heading,
  infoCard,
  layout,
  paragraph,
  strong
} from "../render.js";
import type { RenderedEmail } from "./invitation.js";

export interface RecruiterDigestInput {
  name: string;
  /** e.g. "3 - 9 Nov" */
  weekLabel: string;
  shortlisted: number;
  submitted: number;
  interviews: number;
  rejected: number;
  targetShortlisted: number;
  targetSubmitted: number;
  reportsUrl: string;
}

export interface TeamDigestRow {
  name: string;
  shortlisted: number;
  submitted: number;
  interviews: number;
  rejected: number;
  hitTargets: boolean;
}

export interface TeamDigestRedFlag {
  jobTitle: string;
  clientName: string;
  daysLive: number;
  daysSinceSubmission: number | null;
}

export interface TeamDigestInput {
  weekLabel: string;
  rows: TeamDigestRow[];
  totals: { shortlisted: number; submitted: number; interviews: number; rejected: number };
  redFlags: TeamDigestRedFlag[];
  newClients: number;
  jobsOpened: number;
  placements: number;
  reportsUrl: string;
}

/** Small cross-client stats table used by both digests. */
function statsTable(headers: string[], rows: string[][]): string {
  const th = headers
    .map(
      (h, i) =>
        `<td style="padding:8px 10px;font-family:${fontStack};font-size:12px;font-weight:700;color:${brand.textSubtle};${i === 0 ? "" : "text-align:right;"}border-bottom:1px solid ${brand.border};">${escapeHtml(h)}</td>`
    )
    .join("");
  const body = rows
    .map(
      (cells) =>
        `<tr>${cells
          .map(
            (c, i) =>
              `<td style="padding:8px 10px;font-family:${fontStack};font-size:14px;color:${i === 0 ? brand.text : brand.textMuted};${i === 0 ? "" : "text-align:right;"}border-bottom:1px solid ${brand.border};">${c}</td>`
          )
          .join("")}</tr>`
    )
    .join("");
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
    style="border:1px solid ${brand.border};border-radius:12px;border-collapse:separate;overflow:hidden;margin:0 0 26px 0;">
    <tr>${th}</tr>${body}
  </table>`;
}

export function renderRecruiterDigestEmail(input: RecruiterDigestInput): RenderedEmail {
  const hitBoth =
    input.shortlisted >= input.targetShortlisted && input.submitted >= input.targetSubmitted;
  const subject = `Your week in review (${input.weekLabel})`;

  const content =
    eyebrow("Weekly report") +
    heading(`Your week, ${input.name.split(" ")[0] ?? input.name}`) +
    paragraph(
      hitBoth
        ? `You hit both weekly targets last week (${strong(`${input.targetShortlisted} shortlisted / ${input.targetSubmitted} submitted`)}). Keep it going.`
        : `The weekly targets are ${strong(`${input.targetShortlisted} shortlisted / ${input.targetSubmitted} submitted`)} - here is where last week landed.`
    ) +
    infoCard([
      { label: "Shortlisted", value: `${input.shortlisted} (target ${input.targetShortlisted})` },
      { label: "Submitted", value: `${input.submitted} (target ${input.targetSubmitted})` },
      { label: "Interviews", value: String(input.interviews) },
      { label: "Rejections", value: String(input.rejected) }
    ]) +
    button({ href: input.reportsUrl, label: "Open your report" });

  const html = layout({
    previewText: `${input.weekLabel}: ${input.shortlisted} shortlisted, ${input.submitted} submitted`,
    contentHtml: content
  });

  const text = [
    `Your week in review (${input.weekLabel})`,
    "",
    `Shortlisted: ${input.shortlisted} (target ${input.targetShortlisted})`,
    `Submitted: ${input.submitted} (target ${input.targetSubmitted})`,
    `Interviews: ${input.interviews}`,
    `Rejections: ${input.rejected}`,
    "",
    `Full report: ${input.reportsUrl}`
  ].join("\n");

  return { subject, html, text };
}

export function renderTeamDigestEmail(input: TeamDigestInput): RenderedEmail {
  const subject = `Team week in review (${input.weekLabel})`;

  const scoreRows = input.rows.map((r) => [
    `${escapeHtml(r.name)}${r.hitTargets ? "" : ` <span style="color:${brand.textSubtle};">(below target)</span>`}`,
    String(r.shortlisted),
    String(r.submitted),
    String(r.interviews),
    String(r.rejected)
  ]);
  scoreRows.push([
    `<strong style="color:${brand.text};">Team</strong>`,
    `<strong>${input.totals.shortlisted}</strong>`,
    `<strong>${input.totals.submitted}</strong>`,
    `<strong>${input.totals.interviews}</strong>`,
    `<strong>${input.totals.rejected}</strong>`
  ]);

  const flagRows = input.redFlags.map((f) => [
    `${escapeHtml(f.jobTitle)} <span style="color:${brand.textSubtle};">- ${escapeHtml(f.clientName)}</span>`,
    `${f.daysLive}d live`,
    f.daysSinceSubmission === null
      ? "no submission yet"
      : `${f.daysSinceSubmission}d since submission`
  ]);

  const content =
    eyebrow("Weekly report") +
    heading("Team week in review") +
    paragraph(
      `Last week (${strong(input.weekLabel)}): ${strong(String(input.totals.shortlisted))} shortlisted, ${strong(String(input.totals.submitted))} submitted, ${strong(String(input.newClients))} new clients, ${strong(String(input.jobsOpened))} jobs opened, ${strong(String(input.placements))} placements.`
    ) +
    statsTable(["Recruiter", "Shortlisted", "Submitted", "Interviews", "Rejected"], scoreRows) +
    (flagRows.length > 0
      ? paragraph(
          `${strong(`${flagRows.length} position${flagRows.length === 1 ? "" : "s"}`)} need attention:`
        ) + statsTable(["Position", "Live", "Last submission"], flagRows)
      : paragraph("No positions are flagged - every live role had a recent submission.")) +
    button({ href: input.reportsUrl, label: "Open the full report" });

  const html = layout({
    previewText: `${input.weekLabel}: ${input.totals.submitted} submitted, ${input.redFlags.length} red flag(s)`,
    contentHtml: content
  });

  const text = [
    `Team week in review (${input.weekLabel})`,
    "",
    ...input.rows.map(
      (r) =>
        `${r.name}: ${r.shortlisted} shortlisted, ${r.submitted} submitted, ${r.interviews} interviews, ${r.rejected} rejected`
    ),
    `Team: ${input.totals.shortlisted} shortlisted, ${input.totals.submitted} submitted`,
    "",
    `New clients: ${input.newClients} - Jobs opened: ${input.jobsOpened} - Placements: ${input.placements}`,
    "",
    input.redFlags.length > 0 ? "Red flags:" : "No red-flagged positions.",
    ...input.redFlags.map(
      (f) =>
        `- ${f.jobTitle} (${f.clientName}): ${f.daysLive}d live, ${f.daysSinceSubmission === null ? "no submission yet" : `${f.daysSinceSubmission}d since submission`}`
    ),
    "",
    `Full report: ${input.reportsUrl}`
  ].join("\n");

  return { subject, html, text };
}
