import { eq } from "drizzle-orm";
import {
  applications,
  candidates,
  contacts,
  interviewParticipants,
  interviews,
  jobs,
  users,
  withWorkspace
} from "@emerge/db";
import { getCurrentSession } from "@/server/auth/current";
import { db } from "@/server/db";
import { buildIcs, type IcsAttendee } from "@/server/ics";

const TYPE_LABEL: Record<string, string> = {
  screen: "Screen",
  l1: "L1",
  l2: "L2",
  l3: "L3",
  l4: "L4",
  client: "Client",
  final: "Final",
  other: "Interview"
};

/**
 * Download an interview as an .ics invite (importable into Google/Outlook).
 * Authenticated; scoped to the caller's workspace. Delivery over SMTP arrives
 * with the email milestone; this download works today.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getCurrentSession();
  if (!session) return new Response("Sign in required", { status: 401 });

  const data = await withWorkspace(db, session.workspaceId, async (tx) => {
    const [iv] = await tx
      .select({
        id: interviews.id,
        humanId: interviews.humanId,
        type: interviews.type,
        status: interviews.status,
        scheduledAt: interviews.scheduledAt,
        durationMins: interviews.durationMins,
        location: interviews.location,
        meetingLink: interviews.meetingLink,
        notes: interviews.notes,
        sequence: interviews.sequence,
        candidateFirst: candidates.firstName,
        candidateLast: candidates.lastName,
        candidateEmail: candidates.email,
        jobTitle: jobs.title,
        organizerName: users.name,
        organizerEmail: users.email
      })
      .from(interviews)
      .innerJoin(applications, eq(applications.id, interviews.applicationId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobs, eq(jobs.id, applications.jobId))
      .leftJoin(users, eq(users.id, interviews.organizerId))
      .where(eq(interviews.id, id));
    if (!iv) return null;

    const parts = await tx
      .select({
        userName: users.name,
        userEmail: users.email,
        contactFirst: contacts.firstName,
        contactLast: contacts.lastName,
        contactEmail: contacts.email
      })
      .from(interviewParticipants)
      .leftJoin(users, eq(users.id, interviewParticipants.userId))
      .leftJoin(contacts, eq(contacts.id, interviewParticipants.contactId))
      .where(eq(interviewParticipants.interviewId, id));
    return { iv, parts };
  });

  if (!data) return new Response("Not found", { status: 404 });
  const { iv, parts } = data;

  const candidateName =
    [iv.candidateFirst, iv.candidateLast].filter(Boolean).join(" ") || "Candidate";
  const attendees: IcsAttendee[] = [];
  if (iv.candidateEmail) attendees.push({ email: iv.candidateEmail, name: candidateName });
  for (const p of parts) {
    if (p.userEmail) attendees.push({ email: p.userEmail, name: p.userName });
    else if (p.contactEmail) {
      attendees.push({
        email: p.contactEmail,
        name: [p.contactFirst, p.contactLast].filter(Boolean).join(" ")
      });
    }
  }

  const ics = buildIcs({
    uid: `interview-${iv.id}@emergeautomation.tech`,
    start: iv.scheduledAt,
    durationMins: iv.durationMins,
    summary: `${TYPE_LABEL[iv.type] ?? "Interview"} interview: ${candidateName} - ${iv.jobTitle}`,
    description: iv.notes,
    location: iv.location ?? iv.meetingLink,
    url: iv.meetingLink,
    organizer: iv.organizerEmail ? { email: iv.organizerEmail, name: iv.organizerName } : null,
    attendees,
    status: iv.status === "cancelled" ? "CANCELLED" : "CONFIRMED",
    sequence: iv.sequence,
    stamp: new Date()
  });

  return new Response(ics, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${iv.humanId}.ics"`
    }
  });
}
