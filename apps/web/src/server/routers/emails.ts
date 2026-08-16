import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { emailTemplates, emails, type Transaction } from "@emerge/db";
import { NOTABLE_ENTITY_TYPES } from "@/lib/notes";
import { writeAudit } from "../audit";
import { enqueueEmail } from "../email";
import { buildMergeData } from "../email-merge";
import {
  applyMergeFields,
  makeThreadToken,
  renderRecordEmailHtml,
  replyToAddress
} from "../email-render";
import { router, workspaceProcedure } from "../trpc";

type SendCtx = {
  tx: Transaction;
  workspaceId: string;
  session: { user: { id: string } };
};

/**
 * Render + persist + enqueue one outbound record email inside the caller's
 * workspace transaction. Returns the created row id. `to` overrides the record's
 * resolved recipient (used by the composer); bulk send relies on the default.
 */
async function sendOne(
  ctx: SendCtx,
  input: {
    entityType: string;
    entityId: string;
    to?: string | null;
    cc?: string[];
    subject: string;
    body: string;
    templateId?: string | null;
  }
): Promise<string> {
  const merge = await buildMergeData(ctx.tx, input.entityType, input.entityId);
  if (!merge) throw new TRPCError({ code: "BAD_REQUEST", message: "Record not found" });

  const to = (input.to ?? merge.to)?.trim();
  if (!to) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No recipient: this record has no email, add one or type an address"
    });
  }

  const subject = applyMergeFields(input.subject, merge.data).trim();
  const bodyText = applyMergeFields(input.body, merge.data);
  const html = renderRecordEmailHtml({ bodyText, previewText: subject });
  const token = makeThreadToken();

  const [row] = await ctx.tx
    .insert(emails)
    .values({
      workspaceId: ctx.workspaceId,
      entityType: input.entityType,
      entityId: input.entityId,
      direction: "outbound",
      status: "queued",
      fromAddr: process.env.SMTP_FROM ?? "no-reply@emergeautomation.tech",
      toAddrs: [to],
      ccAddrs: input.cc && input.cc.length > 0 ? input.cc : null,
      subject,
      bodyHtml: html,
      bodyText,
      threadToken: token,
      templateId: input.templateId ?? null,
      sentById: ctx.session.user.id
    })
    .returning({ id: emails.id });
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

  await enqueueEmail({
    type: "record",
    emailId: row.id,
    workspaceId: ctx.workspaceId,
    to: [to],
    cc: input.cc,
    replyTo: replyToAddress(token),
    subject,
    html,
    text: bodyText
  });

  await writeAudit({
    workspaceId: ctx.workspaceId,
    actorUserId: ctx.session.user.id,
    action: "email.sent",
    targetType: input.entityType,
    targetId: input.entityId,
    meta: { emailId: row.id, subject }
  });
  return row.id;
}

/** Resolve a template's subject + body, or null when no template is given. */
async function loadTemplate(tx: Transaction, templateId: string | null | undefined) {
  if (!templateId) return null;
  const [t] = await tx.select().from(emailTemplates).where(eq(emailTemplates.id, templateId));
  if (!t) throw new TRPCError({ code: "BAD_REQUEST", message: "Template not found" });
  return t;
}

const listCols = {
  id: emails.id,
  entityType: emails.entityType,
  entityId: emails.entityId,
  direction: emails.direction,
  status: emails.status,
  fromAddr: emails.fromAddr,
  toAddrs: emails.toAddrs,
  subject: emails.subject,
  bodyText: emails.bodyText,
  sentAt: emails.sentAt,
  repliedAt: emails.repliedAt,
  error: emails.error,
  createdAt: emails.createdAt
};

export const emailsRouter = router({
  /** The email thread on one record, newest first. */
  byRecord: workspaceProcedure
    .input(z.object({ entityType: z.enum(NOTABLE_ENTITY_TYPES), entityId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select(listCols)
        .from(emails)
        .where(and(eq(emails.entityType, input.entityType), eq(emails.entityId, input.entityId)))
        .orderBy(desc(emails.createdAt))
        .limit(200);
    }),

  /** Full body of one email (composer preview / thread expand). */
  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.tx.select().from(emails).where(eq(emails.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Email not found" });
      return row;
    }),

  /** Send an email from a record. A template pre-fills, then merge fields resolve. */
  send: workspaceProcedure
    .input(
      z.object({
        entityType: z.enum(NOTABLE_ENTITY_TYPES),
        entityId: z.string().uuid(),
        to: z.string().trim().email().nullable().optional(),
        cc: z.array(z.string().trim().email()).max(20).optional(),
        subject: z.string().trim().min(1, "Subject is required").max(500),
        body: z.string().trim().min(1, "Body is required").max(50_000),
        templateId: z.string().uuid().nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = await sendOne(ctx, input);
      return { id };
    }),

  /**
   * Mail merge: send one template to many records of the same type, personalised
   * per record. Returns how many were queued and any that were skipped.
   */
  sendBulk: workspaceProcedure
    .input(
      z.object({
        entityType: z.enum(NOTABLE_ENTITY_TYPES),
        entityIds: z.array(z.string().uuid()).min(1).max(200),
        templateId: z.string().uuid()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const template = await loadTemplate(ctx.tx, input.templateId);
      if (!template) throw new TRPCError({ code: "BAD_REQUEST", message: "Template required" });

      let sent = 0;
      const skipped: { entityId: string; reason: string }[] = [];
      for (const entityId of input.entityIds) {
        try {
          await sendOne(ctx, {
            entityType: input.entityType,
            entityId,
            subject: template.subject,
            body: template.bodyHtml,
            templateId: template.id
          });
          sent += 1;
        } catch (err) {
          skipped.push({
            entityId,
            reason: err instanceof TRPCError ? err.message : "Failed to render"
          });
        }
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "email.mail_merge",
        targetType: input.entityType,
        targetId: template.id,
        meta: { sent, skipped: skipped.length, templateId: template.id }
      });
      return { sent, skipped };
    })
});
