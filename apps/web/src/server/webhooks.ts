import { and, eq } from "drizzle-orm";
import { webhookDeliveries, webhookSubscriptions, type Transaction } from "@emerge/db";

/** Events a webhook subscription can listen to (M19). */
export const WEBHOOK_EVENTS = [
  "application.status_changed",
  "candidate.created",
  "job.created"
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/**
 * Queue one delivery per active subscription that listens to `event`. Runs
 * inside the caller's transaction; the worker dispatcher does the actual HTTP.
 * Never throws: a webhook queueing failure must not roll back the business op.
 */
export async function emitWebhook(
  tx: Transaction,
  workspaceId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const subs = await tx
      .select({ id: webhookSubscriptions.id, events: webhookSubscriptions.events })
      .from(webhookSubscriptions)
      .where(
        and(
          eq(webhookSubscriptions.workspaceId, workspaceId),
          eq(webhookSubscriptions.active, true)
        )
      );
    const matching = subs.filter((s) => s.events.includes(event));
    if (matching.length === 0) return;
    await tx.insert(webhookDeliveries).values(
      matching.map((s) => ({
        workspaceId,
        subscriptionId: s.id,
        event,
        payload,
        nextAttemptAt: new Date()
      }))
    );
  } catch (err) {
    console.error(`[webhooks] emit ${event} failed:`, err);
  }
}
