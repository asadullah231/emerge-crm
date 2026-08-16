import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  applicationStatusHistory,
  applicationStatuses,
  applications,
  notifications,
  submissions,
  type Transaction
} from "@emerge/db";
import { DEFAULT_APPLICATION_STATUSES } from "@/lib/applications";
import { writeAudit } from "./audit";

/** A raw share token (in the URL) and the SHA-256 we persist. */
export function makeShareToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
export function newBatchId(): string {
  return randomUUID();
}

/** Verdict-driven target statuses on the M5 application machine. */
export const VERDICT_STATUS = {
  approved: { statusKey: "approved_by_client", stage: "submitted" as const },
  rejected: { statusKey: "rejected_by_client", stage: "rejected" as const }
};

/**
 * Seed the workspace status dictionary if empty. Mirrors the applications
 * router so submissions can transition statuses without importing it. Idempotent.
 */
export async function ensureStatuses(tx: Transaction, workspaceId: string): Promise<void> {
  await tx
    .insert(applicationStatuses)
    .values(
      DEFAULT_APPLICATION_STATUSES.map((s) => ({
        workspaceId,
        key: s.key,
        label: s.label,
        stage: s.stage,
        sortOrder: s.sortOrder,
        isEntry: s.isEntry,
        isTerminal: s.isTerminal
      }))
    )
    .onConflictDoNothing({ target: [applicationStatuses.workspaceId, applicationStatuses.key] });
}

/**
 * Move one application to `statusKey`, writing status history (and audit). The
 * stage follows the status's stage. actorUserId is null for client actions.
 * Returns the prior status/stage so callers can no-op or annotate.
 */
export async function setApplicationStatus(
  tx: Transaction,
  opts: {
    workspaceId: string;
    applicationId: string;
    statusKey: string;
    actorUserId: string | null;
    note?: string | null;
  }
): Promise<{ ownerId: string | null; fromStatusKey: string } | null> {
  const [target] = await tx
    .select()
    .from(applicationStatuses)
    .where(eq(applicationStatuses.key, opts.statusKey));
  if (!target) return null;
  const [current] = await tx
    .select()
    .from(applications)
    .where(and(eq(applications.id, opts.applicationId), isNull(applications.deletedAt)));
  if (!current) return null;

  const stageChanged = current.stage !== target.stage;
  await tx
    .update(applications)
    .set({
      statusKey: target.key,
      stage: target.stage,
      stageEnteredAt: stageChanged ? new Date() : current.stageEnteredAt
    })
    .where(eq(applications.id, opts.applicationId));
  await tx.insert(applicationStatusHistory).values({
    workspaceId: opts.workspaceId,
    applicationId: opts.applicationId,
    fromStatusKey: current.statusKey,
    toStatusKey: target.key,
    fromStage: current.stage,
    toStage: target.stage,
    actorUserId: opts.actorUserId,
    note: opts.note ?? null
  });
  await writeAudit({
    workspaceId: opts.workspaceId,
    actorUserId: opts.actorUserId,
    action: "application.status_changed",
    targetType: "application",
    targetId: opts.applicationId,
    meta: { from: current.statusKey, to: target.key, via: "submission" }
  });
  return { ownerId: current.ownerId, fromStatusKey: current.statusKey };
}

/** True when the share link is no longer valid (archived or past expiry). */
export function isExpired(row: { expiresAt: Date | null; status: string }): boolean {
  if (row.status === "archived") return true;
  return row.expiresAt != null && row.expiresAt.getTime() < Date.now();
}

/**
 * Record a client's verdict on one submission and sync the application. Runs
 * inside an already-open workspace transaction (public route or tRPC). Returns
 * the affected application id, or null if the submission is gone/expired/decided.
 */
export async function applyVerdict(
  tx: Transaction,
  opts: {
    workspaceId: string;
    submissionId: string;
    tokenHash: string;
    verdict: "approved" | "rejected";
    comment: string | null;
  }
): Promise<{ applicationId: string } | null> {
  const [row] = await tx
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, opts.submissionId), eq(submissions.tokenHash, opts.tokenHash)));
  if (!row) return null;
  if (isExpired(row)) return null;
  if (row.status !== "submitted") return null; // already decided

  await tx
    .update(submissions)
    .set({ status: opts.verdict, clientComment: opts.comment, verdictAt: new Date() })
    .where(eq(submissions.id, row.id));

  const target = VERDICT_STATUS[opts.verdict];
  const result = await setApplicationStatus(tx, {
    workspaceId: opts.workspaceId,
    applicationId: row.applicationId,
    statusKey: target.statusKey,
    actorUserId: null,
    note: opts.comment ? `Client ${opts.verdict}: ${opts.comment}` : `Client ${opts.verdict}`
  });

  // Notify the sourcer/AM who owns the application.
  if (result?.ownerId) {
    await tx.insert(notifications).values({
      workspaceId: opts.workspaceId,
      recipientId: result.ownerId,
      kind: "submission_verdict",
      actorId: null,
      entityType: "application",
      entityId: row.applicationId
    });
  }
  await writeAudit({
    workspaceId: opts.workspaceId,
    actorUserId: null,
    action: `submission.${opts.verdict}`,
    targetType: "submission",
    targetId: row.id,
    meta: { applicationId: row.applicationId }
  });
  return { applicationId: row.applicationId };
}
