import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  memberships,
  noteKind,
  noteMentions,
  noteTemplates,
  notes,
  notifications,
  users,
  type Transaction
} from "@emerge/db";
import { DEFAULT_NOTE_TEMPLATES, NOTABLE_ENTITY_TYPES, type NotableEntityType } from "@/lib/notes";
import { writeAudit } from "../audit";
import { sendMentionEmails } from "../mention-emails";
import { roleAtLeast, router, workspaceProcedure } from "../trpc";

const entityType = z.enum(NOTABLE_ENTITY_TYPES);
const noteBody = z.string().trim().min(1, "Note cannot be empty").max(10000);
const mentionIds = z.array(z.string().uuid()).max(50).optional();

/** Keep only the ids that are active members of this workspace. */
async function activeMemberIds(tx: Transaction, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await tx
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(inArray(memberships.userId, ids), isNull(memberships.deactivatedAt)));
  return rows.map((r) => r.userId);
}

/** Insert mention rows + fan out a notification to each mentioned member. */
export async function fanOutMentions(
  tx: Transaction,
  opts: {
    workspaceId: string;
    noteId: string;
    entityType: string;
    entityId: string;
    authorId: string;
    mentionUserIds: string[];
  }
): Promise<string[]> {
  const valid = (await activeMemberIds(tx, opts.mentionUserIds)).filter(
    (id) => id !== opts.authorId
  );
  if (valid.length === 0) return [];
  await tx
    .insert(noteMentions)
    .values(valid.map((userId) => ({ workspaceId: opts.workspaceId, noteId: opts.noteId, userId })))
    .onConflictDoNothing({ target: [noteMentions.noteId, noteMentions.userId] });
  await tx.insert(notifications).values(
    valid.map((recipientId) => ({
      workspaceId: opts.workspaceId,
      recipientId,
      kind: "mention" as const,
      actorId: opts.authorId,
      entityType: opts.entityType,
      entityId: opts.entityId,
      noteId: opts.noteId
    }))
  );
  return valid;
}

async function ensureTemplates(tx: Transaction, workspaceId: string): Promise<void> {
  await tx
    .insert(noteTemplates)
    .values(DEFAULT_NOTE_TEMPLATES.map((t) => ({ workspaceId, ...t })))
    .onConflictDoNothing({ target: [noteTemplates.workspaceId, noteTemplates.name] });
}

export const notesRouter = router({
  list: workspaceProcedure
    .input(
      z.object({
        entityType,
        entityId: z.string().uuid(),
        order: z.enum(["recent", "oldest"]).default("recent")
      })
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.tx
        .select({
          id: notes.id,
          kind: notes.kind,
          body: notes.body,
          authorId: notes.authorId,
          authorName: users.name,
          createdAt: notes.createdAt,
          updatedAt: notes.updatedAt
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
        .orderBy(input.order === "recent" ? desc(notes.createdAt) : asc(notes.createdAt));
      if (rows.length === 0) return [];
      const mentions = await ctx.tx
        .select({ noteId: noteMentions.noteId, userId: noteMentions.userId, name: users.name })
        .from(noteMentions)
        .leftJoin(users, eq(users.id, noteMentions.userId))
        .where(
          inArray(
            noteMentions.noteId,
            rows.map((r) => r.id)
          )
        );
      return rows.map((r) => ({
        ...r,
        mentions: mentions
          .filter((m) => m.noteId === r.id)
          .map((m) => ({ userId: m.userId, name: m.name }))
      }));
    }),

  create: workspaceProcedure
    .input(
      z.object({
        entityType,
        entityId: z.string().uuid(),
        body: noteBody,
        kind: z.enum(noteKind.enumValues).optional(),
        mentionUserIds: mentionIds
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.tx
        .insert(notes)
        .values({
          workspaceId: ctx.workspaceId,
          entityType: input.entityType,
          entityId: input.entityId,
          authorId: ctx.session.user.id,
          kind: input.kind ?? "note",
          body: input.body
        })
        .returning();
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const notified = await fanOutMentions(ctx.tx, {
        workspaceId: ctx.workspaceId,
        noteId: created.id,
        entityType: input.entityType,
        entityId: input.entityId,
        authorId: ctx.session.user.id,
        mentionUserIds: input.mentionUserIds ?? []
      });
      // Email fan-out (M16). A queue outage must never fail the note write.
      if (notified.length > 0) {
        try {
          await sendMentionEmails(ctx.tx, {
            authorName: ctx.session.user.name,
            entityType: input.entityType,
            entityId: input.entityId,
            noteBody: input.body,
            recipientIds: notified
          });
        } catch (err) {
          console.error("[notes.create] mention email enqueue failed:", err);
        }
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "note.created",
        targetType: input.entityType,
        targetId: input.entityId,
        meta: { noteId: created.id, mentioned: notified.length }
      });
      return created;
    }),

  update: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        body: noteBody,
        kind: z.enum(noteKind.enumValues).optional(),
        mentionUserIds: mentionIds
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [note] = await ctx.tx
        .select()
        .from(notes)
        .where(and(eq(notes.id, input.id), isNull(notes.deletedAt)));
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      if (note.authorId !== ctx.session.user.id && !roleAtLeast(ctx.role, "admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own notes" });
      }
      const [updated] = await ctx.tx
        .update(notes)
        .set({ body: input.body, ...(input.kind ? { kind: input.kind } : {}) })
        .where(eq(notes.id, input.id))
        .returning();
      // Re-sync mentions: notify only newly added ones.
      if (input.mentionUserIds) {
        const existing = await ctx.tx
          .select({ userId: noteMentions.userId })
          .from(noteMentions)
          .where(eq(noteMentions.noteId, input.id));
        const existingSet = new Set(existing.map((e) => e.userId));
        const added = input.mentionUserIds.filter((id) => !existingSet.has(id));
        if (added.length > 0) {
          const notified = await fanOutMentions(ctx.tx, {
            workspaceId: ctx.workspaceId,
            noteId: input.id,
            entityType: note.entityType,
            entityId: note.entityId,
            authorId: ctx.session.user.id,
            mentionUserIds: added
          });
          if (notified.length > 0) {
            try {
              await sendMentionEmails(ctx.tx, {
                authorName: ctx.session.user.name,
                entityType: note.entityType as NotableEntityType,
                entityId: note.entityId,
                noteBody: input.body,
                recipientIds: notified
              });
            } catch (err) {
              console.error("[notes.update] mention email enqueue failed:", err);
            }
          }
        }
      }
      return updated;
    }),

  remove: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [note] = await ctx.tx
        .select()
        .from(notes)
        .where(and(eq(notes.id, input.id), isNull(notes.deletedAt)));
      if (!note) throw new TRPCError({ code: "NOT_FOUND", message: "Note not found" });
      if (note.authorId !== ctx.session.user.id && !roleAtLeast(ctx.role, "admin")) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own notes" });
      }
      await ctx.tx.update(notes).set({ deletedAt: new Date() }).where(eq(notes.id, input.id));
      return { id: input.id };
    }),

  /** Workspace note templates (seeded on first use). */
  templates: workspaceProcedure.query(async ({ ctx }) => {
    await ensureTemplates(ctx.tx, ctx.workspaceId);
    return ctx.tx
      .select({ id: noteTemplates.id, name: noteTemplates.name, body: noteTemplates.body })
      .from(noteTemplates)
      .orderBy(asc(noteTemplates.sortOrder));
  })
});
