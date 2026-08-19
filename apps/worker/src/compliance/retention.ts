/**
 * Retention sweep (M20): for every workspace whose retention policy has
 * autoDelete on, soft-delete candidates untouched for `months` months that
 * have no live applications. Soft delete only - the normal 30-day trash
 * window still applies before data is truly gone, and a restore undoes it.
 * Runs daily on the owner connection; one audit row per workspace sweep.
 */
import { and, eq, inArray, isNull, lt, notInArray } from "drizzle-orm";
import { applications, auditLog, candidates, retentionPolicies, type Database } from "@emerge/db";

export async function sweepRetention(db: Database, now = new Date()): Promise<number> {
  const policies = await db
    .select()
    .from(retentionPolicies)
    .where(eq(retentionPolicies.autoDelete, true));
  if (policies.length === 0) return 0;

  let totalTrashed = 0;
  for (const policy of policies) {
    const cutoff = new Date(now.getTime() - policy.months * 30 * 24 * 60 * 60 * 1000);

    // Candidates with any live application are always kept.
    const liveCandidateIds = db
      .select({ id: applications.candidateId })
      .from(applications)
      .where(and(eq(applications.workspaceId, policy.workspaceId), isNull(applications.deletedAt)));

    const stale = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.workspaceId, policy.workspaceId),
          isNull(candidates.deletedAt),
          lt(candidates.updatedAt, cutoff),
          notInArray(candidates.id, liveCandidateIds)
        )
      )
      .limit(500);
    if (stale.length === 0) continue;

    await db
      .update(candidates)
      .set({ deletedAt: now })
      .where(
        inArray(
          candidates.id,
          stale.map((s) => s.id)
        )
      );
    await db.insert(auditLog).values({
      workspaceId: policy.workspaceId,
      actorUserId: null,
      action: "compliance.retention_swept",
      targetType: "workspace",
      targetId: policy.workspaceId,
      meta: { trashed: stale.length, months: policy.months, via: "cron" }
    });
    totalTrashed += stale.length;
  }
  return totalTrashed;
}
