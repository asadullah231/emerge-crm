import { eq } from "drizzle-orm";
import { offerStatusHistory, offers, type OfferStatus, type Transaction } from "@emerge/db";
import { writeAudit } from "./audit";
import { setApplicationStatus } from "./submissions";

/**
 * Offer status -> application status the transition should drive. A `sent`
 * offer puts the application in "Offer made"; the resolution statuses map onto
 * the offer/rejected stages seeded in M12. `expired` leaves the application be
 * (the offer is flagged; the recruiter decides the next step).
 */
export const OFFER_APP_STATUS: Partial<Record<OfferStatus, string>> = {
  sent: "offer_made",
  accepted: "offer_accepted",
  declined: "offer_declined",
  withdrawn: "offer_withdrawn"
};

/** Allowed status transitions for an offer. */
export const OFFER_TRANSITIONS: Record<OfferStatus, OfferStatus[]> = {
  draft: ["sent", "withdrawn"],
  sent: ["accepted", "declined", "withdrawn", "expired"],
  accepted: [],
  declined: [],
  withdrawn: [],
  expired: []
};

export function canTransitionOffer(from: OfferStatus, to: OfferStatus): boolean {
  return OFFER_TRANSITIONS[from].includes(to);
}

/** The timestamp column set when an offer enters a given status. */
const STATUS_STAMP: Partial<
  Record<OfferStatus, "sentAt" | "acceptedAt" | "declinedAt" | "withdrawnAt">
> = {
  sent: "sentAt",
  accepted: "acceptedAt",
  declined: "declinedAt",
  withdrawn: "withdrawnAt"
};

/**
 * Move one offer to `to`, writing the stamp column, offer status history and
 * audit, and syncing the application status when the transition maps to one.
 * Runs inside an open workspace transaction. Returns null when the offer is
 * missing or the transition is not allowed (caller decides the error).
 */
export async function transitionOffer(
  tx: Transaction,
  opts: {
    workspaceId: string;
    offerId: string;
    to: OfferStatus;
    actorUserId: string | null;
    reason?: string | null;
    /** For `sent`: who sent it, expiry, and medium override. */
    sentById?: string | null;
    expiresAt?: Date | null;
  }
): Promise<{ applicationId: string; from: OfferStatus } | null> {
  const [offer] = await tx.select().from(offers).where(eq(offers.id, opts.offerId));
  if (!offer) return null;
  if (!canTransitionOffer(offer.status, opts.to)) return null;

  const now = new Date();
  const patch: Record<string, unknown> = { status: opts.to, updatedAt: now };
  const stamp = STATUS_STAMP[opts.to];
  if (stamp) patch[stamp] = now;
  if (opts.to === "sent") {
    if (opts.sentById !== undefined) patch.sentById = opts.sentById;
    if (opts.expiresAt !== undefined) patch.expiresAt = opts.expiresAt;
  }
  if (opts.to === "declined" || opts.to === "withdrawn") {
    patch.declineReason = opts.reason ?? null;
  }
  await tx.update(offers).set(patch).where(eq(offers.id, opts.offerId));

  await tx.insert(offerStatusHistory).values({
    workspaceId: opts.workspaceId,
    offerId: opts.offerId,
    fromStatus: offer.status,
    toStatus: opts.to,
    actorUserId: opts.actorUserId,
    note: opts.reason ?? null
  });

  const appStatus = OFFER_APP_STATUS[opts.to];
  if (appStatus) {
    await setApplicationStatus(tx, {
      workspaceId: opts.workspaceId,
      applicationId: offer.applicationId,
      statusKey: appStatus,
      actorUserId: opts.actorUserId,
      note: opts.reason ? `Offer ${opts.to}: ${opts.reason}` : `Offer ${opts.to}`
    });
  }

  await writeAudit({
    workspaceId: opts.workspaceId,
    actorUserId: opts.actorUserId,
    action: `offer.${opts.to}`,
    targetType: "application",
    targetId: offer.applicationId,
    meta: { offerId: opts.offerId, humanId: offer.humanId, from: offer.status }
  });

  return { applicationId: offer.applicationId, from: offer.status };
}

/** True when a sent offer is past its expiry (used by the router + cron). */
export function isOfferOverdue(row: { status: OfferStatus; expiresAt: Date | null }): boolean {
  return row.status === "sent" && row.expiresAt != null && row.expiresAt.getTime() < Date.now();
}
