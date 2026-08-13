import { auditLog } from "@emerge/db";
import { db } from "./db";

export type AuditEvent = {
  workspaceId?: string | null;
  actorUserId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  meta?: Record<string, unknown>;
};

/**
 * Append one audit row. Runs on the owner connection so it works both inside
 * and outside workspace context (e.g. failed logins have no workspace).
 * Never throws: an audit failure must not break the mutation it describes.
 */
export async function writeAudit(event: AuditEvent): Promise<void> {
  try {
    await db.insert(auditLog).values({
      workspaceId: event.workspaceId ?? null,
      actorUserId: event.actorUserId ?? null,
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      meta: event.meta
    });
  } catch (error) {
    console.error("audit write failed", event.action, error);
  }
}
