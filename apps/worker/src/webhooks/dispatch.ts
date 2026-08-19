/**
 * Webhook dispatcher sweep (M19): POSTs due pending deliveries to their
 * subscription URLs with an HMAC-SHA256 signature, retrying with exponential
 * backoff (2^attempts minutes, max 5 attempts) before marking failed. Runs on
 * the owner (RLS-bypassing) connection so one pass covers every workspace.
 */
import { createHmac } from "node:crypto";
import { and, asc, eq, lte } from "drizzle-orm";
import { webhookDeliveries, webhookSubscriptions, type Database } from "@emerge/db";

const MAX_ATTEMPTS = 5;
const BATCH = 50;
const TIMEOUT_MS = 10_000;

export async function dispatchDueWebhooks(db: Database, now = new Date()): Promise<number> {
  const due = await db
    .select({
      id: webhookDeliveries.id,
      event: webhookDeliveries.event,
      payload: webhookDeliveries.payload,
      attempts: webhookDeliveries.attempts,
      createdAt: webhookDeliveries.createdAt,
      url: webhookSubscriptions.url,
      secret: webhookSubscriptions.secret,
      active: webhookSubscriptions.active
    })
    .from(webhookDeliveries)
    .innerJoin(webhookSubscriptions, eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId))
    .where(and(eq(webhookDeliveries.status, "pending"), lte(webhookDeliveries.nextAttemptAt, now)))
    .orderBy(asc(webhookDeliveries.nextAttemptAt))
    .limit(BATCH);
  if (due.length === 0) return 0;

  let delivered = 0;
  for (const d of due) {
    // Subscription switched off after queueing: park the delivery as failed.
    if (!d.active) {
      await db
        .update(webhookDeliveries)
        .set({ status: "failed", lastError: "Subscription inactive" })
        .where(eq(webhookDeliveries.id, d.id));
      continue;
    }

    const body = JSON.stringify({
      event: d.event,
      payload: d.payload,
      created_at: d.createdAt.toISOString()
    });
    const signature = createHmac("sha256", d.secret).update(body).digest("hex");

    try {
      const res = await fetch(d.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-emerge-event": d.event,
          "x-emerge-signature": `sha256=${signature}`
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await db
        .update(webhookDeliveries)
        .set({ status: "delivered", deliveredAt: new Date(), lastError: null })
        .where(eq(webhookDeliveries.id, d.id));
      delivered++;
    } catch (err) {
      const attempts = d.attempts + 1;
      const message = err instanceof Error ? err.message : String(err);
      await db
        .update(webhookDeliveries)
        .set({
          attempts,
          lastError: message.slice(0, 500),
          status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
          nextAttemptAt: new Date(now.getTime() + 2 ** attempts * 60_000)
        })
        .where(eq(webhookDeliveries.id, d.id));
    }
  }
  return delivered;
}
