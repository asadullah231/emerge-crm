import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import {
  applications,
  attachments,
  candidates,
  companies,
  jobs,
  submissions,
  withWorkspace
} from "@emerge/db";
import { db } from "./db";
import { hashToken, isExpired } from "./submissions";

export type ShareCandidate = {
  submissionId: string;
  applicationId: string;
  candidateName: string;
  title: string | null;
  employer: string | null;
  status: string;
  clientComment: string | null;
  verdictAt: Date | null;
  hasCv: boolean;
};

export type ShareBatch = {
  workspaceId: string;
  jobTitle: string;
  companyName: string | null;
  note: string | null;
  sentAt: Date;
  candidates: ShareCandidate[];
};

function fullName(first: string | null, last: string | null): string {
  return [first, last].filter(Boolean).join(" ").trim() || "Candidate";
}

/**
 * Resolve a raw share token to its batch. The workspace is looked up on the
 * owner connection (RLS-bypassing, keyed only by the token hash), then the batch
 * is loaded inside that workspace's RLS transaction. Returns null when the token
 * is unknown or every row in the batch has expired/been revoked.
 */
export async function loadShareByToken(token: string): Promise<ShareBatch | null> {
  const tokenHash = hashToken(token);
  const [head] = await db
    .select({ workspaceId: submissions.workspaceId })
    .from(submissions)
    .where(eq(submissions.tokenHash, tokenHash))
    .limit(1);
  if (!head) return null;

  return withWorkspace(db, head.workspaceId, async (tx) => {
    const rows = await tx
      .select({
        submissionId: submissions.id,
        applicationId: submissions.applicationId,
        status: submissions.status,
        clientComment: submissions.clientComment,
        verdictAt: submissions.verdictAt,
        expiresAt: submissions.expiresAt,
        note: submissions.note,
        sentAt: submissions.sentAt,
        candidateId: applications.candidateId,
        firstName: candidates.firstName,
        lastName: candidates.lastName,
        title: candidates.title,
        employer: candidates.currentEmployer,
        jobTitle: jobs.title,
        companyName: companies.name
      })
      .from(submissions)
      .innerJoin(applications, eq(applications.id, submissions.applicationId))
      .innerJoin(candidates, eq(candidates.id, applications.candidateId))
      .innerJoin(jobs, eq(jobs.id, submissions.jobId))
      .leftJoin(companies, eq(companies.id, submissions.companyId))
      .where(eq(submissions.tokenHash, tokenHash))
      .orderBy(desc(submissions.sentAt));

    const live = rows.filter((r) => !isExpired(r));
    if (live.length === 0) return null;

    const candidateIds = live.map((r) => r.candidateId);
    const cvRows = candidateIds.length
      ? await tx
          .select({ entityId: attachments.entityId })
          .from(attachments)
          .where(
            and(
              eq(attachments.entityType, "candidate"),
              inArray(attachments.entityId, candidateIds),
              inArray(attachments.kind, ["cv", "formatted_cv"]),
              isNull(attachments.deletedAt)
            )
          )
      : [];
    const withCv = new Set(cvRows.map((r) => r.entityId));

    const first = live[0]!;
    return {
      workspaceId: head.workspaceId,
      jobTitle: first.jobTitle,
      companyName: first.companyName,
      note: first.note,
      sentAt: first.sentAt,
      candidates: live.map((r) => ({
        submissionId: r.submissionId,
        applicationId: r.applicationId,
        candidateName: fullName(r.firstName, r.lastName),
        title: r.title,
        employer: r.employer,
        status: r.status,
        clientComment: r.clientComment,
        verdictAt: r.verdictAt,
        hasCv: withCv.has(r.candidateId)
      }))
    };
  });
}

/** Latest CV object key for the candidate behind a submission on this token. */
export async function loadShareCv(
  token: string,
  applicationId: string
): Promise<{ objectKey: string; filename: string } | null> {
  const tokenHash = hashToken(token);
  const [head] = await db
    .select({ workspaceId: submissions.workspaceId })
    .from(submissions)
    .where(and(eq(submissions.tokenHash, tokenHash), eq(submissions.applicationId, applicationId)))
    .limit(1);
  if (!head) return null;

  return withWorkspace(db, head.workspaceId, async (tx) => {
    const [sub] = await tx
      .select({
        candidateId: applications.candidateId,
        expiresAt: submissions.expiresAt,
        status: submissions.status
      })
      .from(submissions)
      .innerJoin(applications, eq(applications.id, submissions.applicationId))
      .where(
        and(eq(submissions.tokenHash, tokenHash), eq(submissions.applicationId, applicationId))
      )
      .limit(1);
    if (!sub || isExpired(sub)) return null;
    const [cv] = await tx
      .select({ objectKey: attachments.objectKey, filename: attachments.filename })
      .from(attachments)
      .where(
        and(
          eq(attachments.entityType, "candidate"),
          eq(attachments.entityId, sub.candidateId),
          inArray(attachments.kind, ["cv", "formatted_cv"]),
          isNull(attachments.deletedAt)
        )
      )
      .orderBy(desc(attachments.createdAt))
      .limit(1);
    return cv ?? null;
  });
}
