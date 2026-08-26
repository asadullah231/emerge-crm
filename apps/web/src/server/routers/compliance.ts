import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
  applicationStatusHistory,
  applications,
  attachments,
  candidateEducation,
  candidateExperience,
  candidates,
  companies,
  consentKind,
  consentRecords,
  consentStatus,
  contacts,
  emails,
  interviews,
  jobs,
  notes,
  offers,
  retentionPolicies,
  submissions,
  taggings,
  tasks,
  users
} from "@emerge/db";
import { writeAudit } from "../audit";
import { adminProcedure, router, workspaceProcedure } from "../trpc";

/**
 * GDPR + compliance tools (M20, Zoho Manage Compliance parity): per-candidate
 * data export, right-to-erase (hard delete of the candidate and every child
 * row, logged), consent log, opt-out/blocklist flags and the workspace
 * retention policy.
 */
export const complianceRouter = router({
  /** Everything we hold on one candidate, as a JSON package (GDPR export). */
  exportCandidate: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [candidate] = await ctx.tx.select().from(candidates).where(eq(candidates.id, input.id));
      if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });

      const apps = await ctx.tx
        .select({
          id: applications.id,
          humanId: applications.humanId,
          stage: applications.stage,
          statusKey: applications.statusKey,
          source: applications.source,
          rating: applications.rating,
          jobTitle: jobs.title,
          jobHumanId: jobs.humanId,
          createdAt: applications.createdAt
        })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(eq(applications.candidateId, input.id));
      const appIds = apps.map((a) => a.id);

      const inApps = <T>(rows: T[]) => rows;
      const [
        education,
        experience,
        candidateNotes,
        files,
        candidateEmails,
        interviewRows,
        submissionRows,
        offerRows,
        historyRows,
        consent
      ] = await Promise.all([
        ctx.tx
          .select()
          .from(candidateEducation)
          .where(eq(candidateEducation.candidateId, input.id)),
        ctx.tx
          .select()
          .from(candidateExperience)
          .where(eq(candidateExperience.candidateId, input.id)),
        ctx.tx
          .select({ body: notes.body, createdAt: notes.createdAt })
          .from(notes)
          .where(and(eq(notes.entityType, "candidate"), eq(notes.entityId, input.id))),
        ctx.tx
          .select({
            filename: attachments.filename,
            kind: attachments.kind,
            size: attachments.size,
            createdAt: attachments.createdAt
          })
          .from(attachments)
          .where(and(eq(attachments.entityType, "candidate"), eq(attachments.entityId, input.id))),
        ctx.tx
          .select({
            direction: emails.direction,
            subject: emails.subject,
            toAddrs: emails.toAddrs,
            sentAt: emails.sentAt,
            createdAt: emails.createdAt
          })
          .from(emails)
          .where(and(eq(emails.entityType, "candidate"), eq(emails.entityId, input.id))),
        appIds.length > 0
          ? ctx.tx
              .select({
                type: interviews.type,
                status: interviews.status,
                scheduledAt: interviews.scheduledAt,
                applicationId: interviews.applicationId
              })
              .from(interviews)
              .where(inArray(interviews.applicationId, appIds))
          : Promise.resolve(inApps([])),
        appIds.length > 0
          ? ctx.tx
              .select({
                humanId: submissions.humanId,
                status: submissions.status,
                applicationId: submissions.applicationId,
                createdAt: submissions.createdAt
              })
              .from(submissions)
              .where(inArray(submissions.applicationId, appIds))
          : Promise.resolve(inApps([])),
        appIds.length > 0
          ? ctx.tx
              .select({
                humanId: offers.humanId,
                status: offers.status,
                applicationId: offers.applicationId,
                createdAt: offers.createdAt
              })
              .from(offers)
              .where(inArray(offers.applicationId, appIds))
          : Promise.resolve(inApps([])),
        appIds.length > 0
          ? ctx.tx
              .select({
                applicationId: applicationStatusHistory.applicationId,
                fromStatusKey: applicationStatusHistory.fromStatusKey,
                toStatusKey: applicationStatusHistory.toStatusKey,
                note: applicationStatusHistory.note,
                createdAt: applicationStatusHistory.createdAt
              })
              .from(applicationStatusHistory)
              .where(inArray(applicationStatusHistory.applicationId, appIds))
          : Promise.resolve(inApps([])),
        ctx.tx
          .select({
            kind: consentRecords.kind,
            status: consentRecords.status,
            note: consentRecords.note,
            createdAt: consentRecords.createdAt
          })
          .from(consentRecords)
          .where(eq(consentRecords.candidateId, input.id))
      ]);

      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "candidate.gdpr_exported",
        targetType: "candidate",
        targetId: input.id,
        meta: { humanId: candidate.humanId }
      });

      return {
        exportedAt: new Date().toISOString(),
        candidate,
        education,
        experience,
        notes: candidateNotes,
        attachments: files,
        emails: candidateEmails,
        applications: apps,
        interviews: interviewRows,
        submissions: submissionRows,
        offers: offerRows,
        statusHistory: historyRows,
        consent
      };
    }),

  /**
   * Right to erasure: HARD delete of the candidate and everything hanging off
   * it. FK cascades remove applications/interviews/submissions/offers/consent;
   * polymorphic rows (notes, attachments, emails, tasks, tags) are removed
   * explicitly for both the candidate and its applications. Stored CV files in
   * object storage are not purged here; their DB records (and access) are.
   * The audit entry keeps only the human id, no personal data.
   */
  eraseCandidate: adminProcedure
    .input(z.object({ id: z.string().uuid(), confirm: z.literal(true) }))
    .mutation(async ({ ctx, input }) => {
      const [candidate] = await ctx.tx
        .select({ id: candidates.id, humanId: candidates.humanId })
        .from(candidates)
        .where(eq(candidates.id, input.id));
      if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });

      const apps = await ctx.tx
        .select({ id: applications.id })
        .from(applications)
        .where(eq(applications.candidateId, input.id));
      const appIds = apps.map((a) => a.id);

      const polymorphic = [
        { entityType: "candidate", ids: [input.id] },
        ...(appIds.length > 0 ? [{ entityType: "application", ids: appIds }] : [])
      ];
      let removedRows = 0;
      for (const p of polymorphic) {
        const [n, a, e, t, g] = await Promise.all([
          ctx.tx
            .delete(notes)
            .where(and(eq(notes.entityType, p.entityType), inArray(notes.entityId, p.ids)))
            .returning({ id: notes.id }),
          ctx.tx
            .delete(attachments)
            .where(
              and(eq(attachments.entityType, p.entityType), inArray(attachments.entityId, p.ids))
            )
            .returning({ id: attachments.id }),
          ctx.tx
            .delete(emails)
            .where(and(eq(emails.entityType, p.entityType), inArray(emails.entityId, p.ids)))
            .returning({ id: emails.id }),
          ctx.tx
            .delete(tasks)
            .where(and(eq(tasks.entityType, p.entityType), inArray(tasks.entityId, p.ids)))
            .returning({ id: tasks.id }),
          ctx.tx
            .delete(taggings)
            .where(and(eq(taggings.entityType, p.entityType), inArray(taggings.entityId, p.ids)))
            .returning({ id: taggings.id })
        ]);
        removedRows += n.length + a.length + e.length + t.length + g.length;
      }

      // The candidate row last: FK cascades take applications and their children.
      await ctx.tx.delete(candidates).where(eq(candidates.id, input.id));

      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "candidate.erased",
        targetType: "candidate",
        targetId: input.id,
        meta: {
          humanId: candidate.humanId,
          applications: appIds.length,
          polymorphicRows: removedRows
        }
      });
      return { erased: true, applications: appIds.length };
    }),

  /** Opt-out / blocklist flags (M20). Toggling writes the audit trail. */
  setFlags: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        emailOptOut: z.boolean().optional(),
        isBlocked: z.boolean().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const patch: Partial<{ emailOptOut: boolean; isBlocked: boolean }> = {};
      if (input.emailOptOut !== undefined) patch.emailOptOut = input.emailOptOut;
      if (input.isBlocked !== undefined) patch.isBlocked = input.isBlocked;
      if (Object.keys(patch).length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing to change" });
      }
      const [updated] = await ctx.tx
        .update(candidates)
        .set(patch)
        .where(and(eq(candidates.id, input.id), isNull(candidates.deletedAt)))
        .returning({ id: candidates.id, humanId: candidates.humanId });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "candidate.compliance_flags_changed",
        targetType: "candidate",
        targetId: input.id,
        meta: { humanId: updated.humanId, ...patch }
      });
      return updated;
    }),

  consentList: workspaceProcedure
    .input(z.object({ candidateId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return ctx.tx
        .select({
          id: consentRecords.id,
          kind: consentRecords.kind,
          status: consentRecords.status,
          note: consentRecords.note,
          actorName: users.name,
          createdAt: consentRecords.createdAt
        })
        .from(consentRecords)
        .leftJoin(users, eq(users.id, consentRecords.actorUserId))
        .where(eq(consentRecords.candidateId, input.candidateId))
        .orderBy(desc(consentRecords.createdAt));
    }),

  consentAdd: workspaceProcedure
    .input(
      z.object({
        candidateId: z.string().uuid(),
        kind: z.enum(consentKind.enumValues),
        status: z.enum(consentStatus.enumValues),
        note: z.string().trim().max(1000).optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.tx
        .insert(consentRecords)
        .values({
          workspaceId: ctx.workspaceId,
          candidateId: input.candidateId,
          kind: input.kind,
          status: input.status,
          note: input.note || null,
          actorUserId: ctx.session.user.id
        })
        .returning({ id: consentRecords.id });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // Withdrawing email consent also flips the enforcement flag.
      if (input.kind === "email_marketing") {
        await ctx.tx
          .update(candidates)
          .set({ emailOptOut: input.status === "withdrawn" })
          .where(eq(candidates.id, input.candidateId));
      }
      return created;
    }),

  retentionGet: workspaceProcedure.query(async ({ ctx }) => {
    const [policy] = await ctx.tx
      .select()
      .from(retentionPolicies)
      .where(eq(retentionPolicies.workspaceId, ctx.workspaceId));
    return policy ?? null;
  }),

  retentionSet: adminProcedure
    .input(z.object({ months: z.number().int().min(6).max(120), autoDelete: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.tx
        .select({ id: retentionPolicies.id })
        .from(retentionPolicies)
        .where(eq(retentionPolicies.workspaceId, ctx.workspaceId));
      if (existing) {
        await ctx.tx
          .update(retentionPolicies)
          .set({
            months: input.months,
            autoDelete: input.autoDelete,
            updatedById: ctx.session.user.id,
            updatedAt: new Date()
          })
          .where(eq(retentionPolicies.id, existing.id));
      } else {
        await ctx.tx.insert(retentionPolicies).values({
          workspaceId: ctx.workspaceId,
          months: input.months,
          autoDelete: input.autoDelete,
          updatedById: ctx.session.user.id
        });
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "compliance.retention_updated",
        targetType: "workspace",
        targetId: ctx.workspaceId,
        meta: { months: input.months, autoDelete: input.autoDelete }
      });
      return { ok: true };
    }),

  /** Full workspace data export (admin): core tables as one JSON package. */
  exportWorkspace: adminProcedure.query(async ({ ctx }) => {
    const [candidateRows, companyRows, contactRows, jobRows, applicationRows] = await Promise.all([
      ctx.tx.select().from(candidates).where(isNull(candidates.deletedAt)),
      ctx.tx.select().from(companies).where(isNull(companies.deletedAt)),
      ctx.tx.select().from(contacts).where(isNull(contacts.deletedAt)),
      ctx.tx.select().from(jobs).where(isNull(jobs.deletedAt)),
      ctx.tx.select().from(applications).where(isNull(applications.deletedAt))
    ]);
    await writeAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.session.user.id,
      action: "workspace.data_exported",
      targetType: "workspace",
      targetId: ctx.workspaceId,
      meta: {
        candidates: candidateRows.length,
        companies: companyRows.length,
        contacts: contactRows.length,
        jobs: jobRows.length,
        applications: applicationRows.length
      }
    });
    return {
      exportedAt: new Date().toISOString(),
      candidates: candidateRows,
      companies: companyRows,
      contacts: contactRows,
      jobs: jobRows,
      applications: applicationRows
    };
  })
});
