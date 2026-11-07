/**
 * RD-5: Monday morning report emails. Sweeps workspaces with weekly_digest on;
 * once each Monday (at or after 07:00 UTC) every active member gets their own
 * week-in-review and every admin gets the team digest with red flags. Runs on
 * the owner connection (RLS-bypassing), so EVERY query here must scope by
 * workspace id explicitly.
 */
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  applicationStatusHistory,
  applications,
  companies,
  jobs,
  memberships,
  placements,
  users,
  workspaces,
  type Database
} from "@emerge/db";
import {
  renderRecruiterDigestEmail,
  renderTeamDigestEmail,
  type TeamDigestRedFlag,
  type TeamDigestRow
} from "@emerge/email";
import { sendPlainEmail } from "../email";

const DAY_MS = 24 * 60 * 60 * 1000;
const SEND_HOUR_UTC = 7;
// Same weekly targets as the recruiter report page.
const TARGET_SHORTLISTED = 3;
const TARGET_SUBMITTED = 2;
const STALE_DAYS_LIVE = 30;
const STALE_DAYS_SUBMISSION = 7;

/** Monday 00:00 UTC of the week containing `d`. */
function weekStartUtc(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x;
}

function weekLabel(from: Date, to: Date): string {
  const f = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${f(from)} - ${f(to)}`;
}

export async function sendDueWeeklyDigests(db: Database, now = new Date()): Promise<number> {
  // Due: it is Monday 07:00+ UTC and this week's digest has not gone out yet.
  if (now.getUTCDay() !== 1 || now.getUTCHours() < SEND_HOUR_UTC) return 0;
  const thisMonday = weekStartUtc(now);

  const due = await db
    .select({ id: workspaces.id, lastSentAt: workspaces.weeklyDigestLastSentAt })
    .from(workspaces)
    .where(eq(workspaces.weeklyDigest, true));
  let sent = 0;

  for (const ws of due) {
    if (ws.lastSentAt && ws.lastSentAt >= thisMonday) continue;
    try {
      sent += await sendWorkspaceDigest(db, ws.id, thisMonday);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[worker] weekly digest for workspace ${ws.id} failed:`, msg);
    }
    // Mark as sent either way so a failing workspace does not spam every tick.
    await db
      .update(workspaces)
      .set({ weeklyDigestLastSentAt: now, updatedAt: now })
      .where(eq(workspaces.id, ws.id));
  }
  return sent;
}

async function sendWorkspaceDigest(
  db: Database,
  workspaceId: string,
  thisMonday: Date
): Promise<number> {
  const from = new Date(thisMonday.getTime() - 7 * DAY_MS);
  const to = new Date(thisMonday.getTime() - 1);
  const label = weekLabel(from, new Date(thisMonday.getTime() - DAY_MS));
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const reportsUrl = `${base}/reports/recruiters`;

  const [members, changeRows, openJobs, newClientsRows, newJobsRows, placementRows] =
    await Promise.all([
      db
        .select({
          userId: memberships.userId,
          role: memberships.role,
          name: users.name,
          email: users.email
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(and(eq(memberships.workspaceId, workspaceId), isNull(memberships.deactivatedAt))),
      db
        .select({
          actorId: applicationStatusHistory.actorUserId,
          toStage: applicationStatusHistory.toStage,
          n: sql<number>`count(*)::int`
        })
        .from(applicationStatusHistory)
        .where(
          and(
            eq(applicationStatusHistory.workspaceId, workspaceId),
            gte(applicationStatusHistory.createdAt, from),
            lte(applicationStatusHistory.createdAt, to)
          )
        )
        .groupBy(applicationStatusHistory.actorUserId, applicationStatusHistory.toStage),
      db
        .select({
          id: jobs.id,
          title: jobs.title,
          openedAt: jobs.openedAt,
          companyName: companies.name
        })
        .from(jobs)
        .innerJoin(companies, eq(companies.id, jobs.companyId))
        .where(
          and(eq(jobs.workspaceId, workspaceId), eq(jobs.status, "open"), isNull(jobs.deletedAt))
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(companies)
        .where(
          and(
            eq(companies.workspaceId, workspaceId),
            isNull(companies.deletedAt),
            gte(companies.createdAt, from),
            lte(companies.createdAt, to)
          )
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(jobs)
        .where(
          and(
            eq(jobs.workspaceId, workspaceId),
            isNull(jobs.deletedAt),
            gte(jobs.openedAt, from),
            lte(jobs.openedAt, to)
          )
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(placements)
        .where(
          and(
            eq(placements.workspaceId, workspaceId),
            gte(placements.createdAt, from),
            lte(placements.createdAt, to)
          )
        )
    ]);

  // Red flags need last-submission + placements per open job.
  const openJobIds = openJobs.map((j) => j.id);
  const [lastSubs, placedJobs] = await Promise.all([
    openJobIds.length
      ? db
          .select({
            jobId: applications.jobId,
            last: sql<string>`max(${applicationStatusHistory.createdAt})`
          })
          .from(applicationStatusHistory)
          .innerJoin(applications, eq(applications.id, applicationStatusHistory.applicationId))
          .where(
            and(
              eq(applicationStatusHistory.workspaceId, workspaceId),
              eq(applicationStatusHistory.toStage, "submitted"),
              inArray(applications.jobId, openJobIds)
            )
          )
          .groupBy(applications.jobId)
      : Promise.resolve([] as { jobId: string; last: string }[]),
    openJobIds.length
      ? db
          .select({ jobId: placements.jobId })
          .from(placements)
          .where(
            and(eq(placements.workspaceId, workspaceId), inArray(placements.jobId, openJobIds))
          )
      : Promise.resolve([] as { jobId: string }[])
  ]);
  const lastSubByJob = new Map(lastSubs.map((r) => [r.jobId, new Date(r.last)]));
  const placedJobIds = new Set(placedJobs.map((r) => r.jobId));

  const nowMs = Date.now();
  const redFlags: TeamDigestRedFlag[] = openJobs
    .map((j) => {
      const daysLive = Math.floor((nowMs - j.openedAt.getTime()) / DAY_MS);
      const lastSub = lastSubByJob.get(j.id);
      const daysSinceSubmission = lastSub ? Math.floor((nowMs - lastSub.getTime()) / DAY_MS) : null;
      const flagged =
        (daysLive >= STALE_DAYS_LIVE && !placedJobIds.has(j.id)) ||
        (daysSinceSubmission ?? daysLive) >= STALE_DAYS_SUBMISSION;
      return flagged
        ? { jobTitle: j.title, clientName: j.companyName, daysLive, daysSinceSubmission }
        : null;
    })
    .filter((f): f is TeamDigestRedFlag => f !== null)
    .sort((a, b) => b.daysLive - a.daysLive)
    .slice(0, 15);

  type Counts = { shortlisted: number; submitted: number; interview: number; rejected: number };
  const perUser = new Map<string, Counts>();
  const totals: Counts = { shortlisted: 0, submitted: 0, interview: 0, rejected: 0 };
  for (const r of changeRows) {
    const stage = r.toStage as keyof Counts;
    if (!(stage in totals)) continue;
    totals[stage] += r.n;
    if (!r.actorId) continue;
    const c = perUser.get(r.actorId) ?? { shortlisted: 0, submitted: 0, interview: 0, rejected: 0 };
    c[stage] += r.n;
    perUser.set(r.actorId, c);
  }

  let sent = 0;
  const recruiters = members.filter((m) => m.role === "recruiter");
  for (const m of recruiters) {
    const c = perUser.get(m.userId) ?? { shortlisted: 0, submitted: 0, interview: 0, rejected: 0 };
    const email = renderRecruiterDigestEmail({
      name: m.name,
      weekLabel: label,
      shortlisted: c.shortlisted,
      submitted: c.submitted,
      interviews: c.interview,
      rejected: c.rejected,
      targetShortlisted: TARGET_SHORTLISTED,
      targetSubmitted: TARGET_SUBMITTED,
      reportsUrl
    });
    await sendPlainEmail({ to: [m.email], ...email });
    sent += 1;
  }

  const rows: TeamDigestRow[] = recruiters
    .map((m) => {
      const c = perUser.get(m.userId) ?? {
        shortlisted: 0,
        submitted: 0,
        interview: 0,
        rejected: 0
      };
      return {
        name: m.name,
        shortlisted: c.shortlisted,
        submitted: c.submitted,
        interviews: c.interview,
        rejected: c.rejected,
        hitTargets: c.shortlisted >= TARGET_SHORTLISTED && c.submitted >= TARGET_SUBMITTED
      };
    })
    .sort((a, b) => b.submitted - a.submitted || b.shortlisted - a.shortlisted);

  const admins = members.filter((m) => m.role === "admin");
  if (admins.length > 0) {
    const email = renderTeamDigestEmail({
      weekLabel: label,
      rows,
      totals: {
        shortlisted: totals.shortlisted,
        submitted: totals.submitted,
        interviews: totals.interview,
        rejected: totals.rejected
      },
      redFlags,
      newClients: newClientsRows[0]?.n ?? 0,
      jobsOpened: newJobsRows[0]?.n ?? 0,
      placements: placementRows[0]?.n ?? 0,
      reportsUrl
    });
    await sendPlainEmail({ to: admins.map((a) => a.email), ...email });
    sent += 1;
  }

  return sent;
}
