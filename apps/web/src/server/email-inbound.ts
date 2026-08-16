import { eq } from "drizzle-orm";
import { emails, notifications, withWorkspace } from "@emerge/db";
import { db } from "./db";
import { writeAudit } from "./audit";
import { parseThreadToken } from "./email-render";

/** Normalised inbound message, mapped from the provider (Resend) webhook body. */
export type InboundMessage = {
  from: string;
  to: string[];
  cc?: string[];
  replyTo?: string[];
  subject: string;
  text?: string | null;
  html?: string | null;
  messageId?: string | null;
  inReplyTo?: string | null;
};

/**
 * Thread an inbound reply back onto the record that sent it. The thread token in
 * the Reply-To address resolves the original outbound email on the owner
 * connection (RLS-bypassing), then the inbound row + notification + audit are
 * written inside that workspace. Returns the affected entity, or null when the
 * token is missing/unknown (caller returns 200 either way so the provider does
 * not retry a legitimately unroutable message).
 */
export async function handleInboundReply(
  msg: InboundMessage
): Promise<{ entityType: string; entityId: string } | null> {
  const token = parseThreadToken([...(msg.replyTo ?? []), ...msg.to, ...(msg.cc ?? [])]);
  if (!token) return null;

  const [orig] = await db
    .select({
      id: emails.id,
      workspaceId: emails.workspaceId,
      entityType: emails.entityType,
      entityId: emails.entityId,
      sentById: emails.sentById
    })
    .from(emails)
    .where(eq(emails.threadToken, token))
    .limit(1);
  if (!orig) return null;

  await withWorkspace(db, orig.workspaceId, async (tx) => {
    await tx.insert(emails).values({
      workspaceId: orig.workspaceId,
      entityType: orig.entityType,
      entityId: orig.entityId,
      direction: "inbound",
      status: "received",
      fromAddr: msg.from,
      toAddrs: msg.to,
      ccAddrs: msg.cc && msg.cc.length > 0 ? msg.cc : null,
      subject: msg.subject,
      bodyHtml: msg.html ?? null,
      bodyText: msg.text ?? null,
      messageId: msg.messageId ?? null,
      inReplyTo: msg.inReplyTo ?? null,
      threadToken: token,
      sentAt: new Date()
    });
    // Mark the original as replied so the thread shows the round trip.
    await tx.update(emails).set({ repliedAt: new Date() }).where(eq(emails.id, orig.id));

    // Notify whoever sent the original that a reply landed.
    if (orig.sentById) {
      await tx.insert(notifications).values({
        workspaceId: orig.workspaceId,
        recipientId: orig.sentById,
        kind: "email_reply",
        actorId: null,
        entityType: orig.entityType,
        entityId: orig.entityId
      });
    }
  });

  await writeAudit({
    workspaceId: orig.workspaceId,
    actorUserId: null,
    action: "email.received",
    targetType: orig.entityType,
    targetId: orig.entityId,
    meta: { from: msg.from, subject: msg.subject }
  });
  return { entityType: orig.entityType, entityId: orig.entityId };
}
