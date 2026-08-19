/**
 * Interview reminder sweep (M17c): emails the internal participants and
 * organizer of every scheduled interview starting within the next hour, once.
 * Runs on the owner (RLS-bypassing) connection so one pass covers every
 * workspace; reminder_sent_at is stamped first so a crash cannot double-send.
 */
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import {
  applications,
  candidates,
  interviewParticipants,
  interviews,
  jobs,
  users,
  type Database
} from "@emerge/db";
import { renderInterviewReminderEmail } from "@emerge/email";
import { sendPlainEmail } from "../email";

const TYPE_LABEL: Record<string, string> = {
  screen: "Screen",
  l1: "Round 1",
  l2: "Round 2",
  l3: "Round 3",
  l4: "Round 4",
  client: "Client",
  final: "Final",
  other: "Other"
};

const WINDOW_MS = 60 * 60_000; // remind when the start is within the next hour

export async function sendDueInterviewReminders(db: Database, now = new Date()): Promise<number> {
  const due = await db
    .select({
      id: interviews.id,
      workspaceId: interviews.workspaceId,
      applicationId: interviews.applicationId,
      type: interviews.type,
      scheduledAt: interviews.scheduledAt,
      durationMins: interviews.durationMins,
      location: interviews.location,
      meetingLink: interviews.meetingLink,
      organizerId: interviews.organizerId,
      candidateFirstName: candidates.firstName,
      candidateLastName: candidates.lastName,
      jobTitle: jobs.title
    })
    .from(interviews)
    .innerJoin(applications, eq(applications.id, interviews.applicationId))
    .innerJoin(candidates, eq(candidates.id, applications.candidateId))
    .innerJoin(jobs, eq(jobs.id, applications.jobId))
    .where(
      and(
        eq(interviews.status, "scheduled"),
        isNull(interviews.reminderSentAt),
        gte(interviews.scheduledAt, now),
        lte(interviews.scheduledAt, new Date(now.getTime() + WINDOW_MS))
      )
    );
  if (due.length === 0) return 0;

  let sent = 0;
  for (const iv of due) {
    // Stamp first: a send failure after this loses one reminder, never doubles it.
    await db
      .update(interviews)
      .set({ reminderSentAt: now, updatedAt: now })
      .where(eq(interviews.id, iv.id));

    const parts = await db
      .select({ email: users.email })
      .from(interviewParticipants)
      .innerJoin(users, eq(users.id, interviewParticipants.userId))
      .where(eq(interviewParticipants.interviewId, iv.id));
    const organizer = iv.organizerId
      ? await db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, iv.organizerId))
          .then((r) => r[0] ?? null)
      : null;
    const to = [...new Set([...parts.map((p) => p.email), organizer?.email].filter(Boolean))].map(
      String
    );
    if (to.length === 0) continue;

    const candidateName = [iv.candidateFirstName, iv.candidateLastName].filter(Boolean).join(" ");
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const rendered = renderInterviewReminderEmail({
      candidateName: candidateName || "Candidate",
      jobTitle: iv.jobTitle,
      typeLabel: TYPE_LABEL[iv.type] ?? iv.type,
      scheduledAtText: iv.scheduledAt.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short"
      }),
      durationMins: iv.durationMins,
      location: iv.location,
      meetingLink: iv.meetingLink,
      interviewUrl: `${base}/applications/${iv.applicationId}`
    });
    try {
      await sendPlainEmail({ to, ...rendered });
      sent++;
    } catch (err) {
      console.error(`[worker] interview reminder ${iv.id} failed:`, err);
    }
  }
  return sent;
}
