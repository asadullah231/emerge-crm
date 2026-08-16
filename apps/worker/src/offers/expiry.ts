/**
 * Offer expiry job: flips every `sent` offer whose expiry has passed to
 * `expired`, writing offer status history + an audit row. Runs on the owner
 * connection, which bypasses RLS, so one pass covers all workspaces. Idempotent:
 * once an offer is `expired` it no longer matches the `sent` filter.
 */
import { and, eq, lt } from "drizzle-orm";
import { auditLog, offerStatusHistory, offers, type Database } from "@emerge/db";

export async function expireOverdueOffers(db: Database, now = new Date()): Promise<number> {
  const overdue = await db
    .select({
      id: offers.id,
      workspaceId: offers.workspaceId,
      humanId: offers.humanId,
      applicationId: offers.applicationId
    })
    .from(offers)
    // lt() is false for NULL expiresAt, so no-expiry offers are never touched.
    .where(and(eq(offers.status, "sent"), lt(offers.expiresAt, now)));
  if (overdue.length === 0) return 0;

  for (const o of overdue) {
    await db.update(offers).set({ status: "expired", updatedAt: now }).where(eq(offers.id, o.id));
    await db.insert(offerStatusHistory).values({
      workspaceId: o.workspaceId,
      offerId: o.id,
      fromStatus: "sent",
      toStatus: "expired",
      actorUserId: null,
      note: "Auto-expired (past expiry date)"
    });
    await db.insert(auditLog).values({
      workspaceId: o.workspaceId,
      actorUserId: null,
      action: "offer.expired",
      targetType: "application",
      targetId: o.applicationId,
      meta: { offerId: o.id, humanId: o.humanId, via: "cron" }
    });
  }
  return overdue.length;
}
