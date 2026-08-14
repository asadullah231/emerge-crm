import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { applicationStatusHistory, auditLog, notes, users } from "@emerge/db";
import { NOTABLE_ENTITY_TYPES } from "@/lib/notes";
import { router, workspaceProcedure } from "../trpc";

const entityType = z.enum(NOTABLE_ENTITY_TYPES);

/** A normalized timeline event; the client renders each `kind`. */
export type TimelineEvent = {
  id: string;
  kind: "audit" | "status" | "note";
  actorName: string | null;
  createdAt: Date;
  action?: string;
  meta?: Record<string, unknown> | null;
  fromStatusKey?: string | null;
  toStatusKey?: string;
  fromStage?: string | null;
  toStage?: string;
  note?: string | null;
  body?: string;
  entityType?: string;
  entityId?: string;
};

export const timelineRouter = router({
  /**
   * Per-record activity feed, merged from the existing audit log, the M5
   * application status history, and M6 notes. No M1-M5 code is changed - this
   * reads the events those milestones already record.
   */
  forRecord: workspaceProcedure
    .input(
      z.object({
        entityType,
        entityId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(50)
      })
    )
    .query(async ({ ctx, input }): Promise<TimelineEvent[]> => {
      const [audits, statusRows, noteRows] = await Promise.all([
        ctx.tx
          .select({
            id: auditLog.id,
            action: auditLog.action,
            meta: auditLog.meta,
            createdAt: auditLog.createdAt,
            actorName: users.name
          })
          .from(auditLog)
          .leftJoin(users, eq(users.id, auditLog.actorUserId))
          .where(
            and(eq(auditLog.targetType, input.entityType), eq(auditLog.targetId, input.entityId))
          )
          .orderBy(desc(auditLog.createdAt))
          .limit(input.limit),
        input.entityType === "application"
          ? ctx.tx
              .select({
                id: applicationStatusHistory.id,
                fromStatusKey: applicationStatusHistory.fromStatusKey,
                toStatusKey: applicationStatusHistory.toStatusKey,
                fromStage: applicationStatusHistory.fromStage,
                toStage: applicationStatusHistory.toStage,
                note: applicationStatusHistory.note,
                createdAt: applicationStatusHistory.createdAt,
                actorName: users.name
              })
              .from(applicationStatusHistory)
              .leftJoin(users, eq(users.id, applicationStatusHistory.actorUserId))
              .where(eq(applicationStatusHistory.applicationId, input.entityId))
              .orderBy(desc(applicationStatusHistory.createdAt))
              .limit(input.limit)
          : Promise.resolve([]),
        ctx.tx
          .select({
            id: notes.id,
            body: notes.body,
            createdAt: notes.createdAt,
            actorName: users.name
          })
          .from(notes)
          .leftJoin(users, eq(users.id, notes.authorId))
          .where(
            and(
              eq(notes.entityType, input.entityType),
              eq(notes.entityId, input.entityId),
              isNull(notes.deletedAt)
            )
          )
          .orderBy(desc(notes.createdAt))
          .limit(input.limit)
      ]);

      const events: TimelineEvent[] = [
        // The audit log already records the note.created event; drop it so the
        // note itself is the single timeline entry (no duplicate line).
        ...audits
          .filter((a) => a.action !== "note.created")
          .map((a) => ({
            id: a.id,
            kind: "audit" as const,
            action: a.action,
            meta: a.meta,
            actorName: a.actorName,
            createdAt: a.createdAt
          })),
        ...statusRows.map((s) => ({
          id: s.id,
          kind: "status" as const,
          fromStatusKey: s.fromStatusKey,
          toStatusKey: s.toStatusKey,
          fromStage: s.fromStage,
          toStage: s.toStage,
          note: s.note,
          actorName: s.actorName,
          createdAt: s.createdAt
        })),
        ...noteRows.map((n) => ({
          id: n.id,
          kind: "note" as const,
          body: n.body,
          actorName: n.actorName,
          createdAt: n.createdAt
        }))
      ];
      events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return events.slice(0, input.limit);
    }),

  /** Org-wide recent activity across the workspace (for the Activity page). */
  feed: workspaceProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(40) }))
    .query(async ({ ctx, input }): Promise<TimelineEvent[]> => {
      const notable = [...NOTABLE_ENTITY_TYPES];
      const [audits, noteRows] = await Promise.all([
        ctx.tx
          .select({
            id: auditLog.id,
            action: auditLog.action,
            meta: auditLog.meta,
            targetType: auditLog.targetType,
            targetId: auditLog.targetId,
            createdAt: auditLog.createdAt,
            actorName: users.name
          })
          .from(auditLog)
          .leftJoin(users, eq(users.id, auditLog.actorUserId))
          .where(inArray(auditLog.targetType, notable))
          .orderBy(desc(auditLog.createdAt))
          .limit(input.limit),
        ctx.tx
          .select({
            id: notes.id,
            body: notes.body,
            entityType: notes.entityType,
            entityId: notes.entityId,
            createdAt: notes.createdAt,
            actorName: users.name
          })
          .from(notes)
          .leftJoin(users, eq(users.id, notes.authorId))
          .where(isNull(notes.deletedAt))
          .orderBy(desc(notes.createdAt))
          .limit(input.limit)
      ]);

      const events: TimelineEvent[] = [
        ...audits
          .filter((a) => a.action !== "note.created")
          .map((a) => ({
            id: a.id,
            kind: "audit" as const,
            action: a.action,
            meta: a.meta,
            actorName: a.actorName,
            createdAt: a.createdAt,
            entityType: a.targetType ?? undefined,
            entityId: a.targetId ?? undefined
          })),
        ...noteRows.map((n) => ({
          id: n.id,
          kind: "note" as const,
          body: n.body,
          actorName: n.actorName,
          createdAt: n.createdAt,
          entityType: n.entityType,
          entityId: n.entityId
        }))
      ];
      events.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return events.slice(0, input.limit);
    })
});
