import { TRPCError } from "@trpc/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  isNotNull,
  ne,
  sql,
  type SQL
} from "drizzle-orm";
import { z } from "zod";
import {
  applicationStatusHistory,
  applications,
  attachments,
  companies,
  contacts,
  jobEmploymentType,
  jobStatus,
  jobWorkMode,
  jobs,
  memberships,
  users
} from "@emerge/db";
import { APPLICATION_STAGES } from "@/lib/applications";
import { writeAudit } from "../audit";
import { bumpCounter, humanId, nextCounter } from "../counters";
import { enqueueEmail } from "../email";
import { buildListClauses, listInput, trashCutoff } from "../list-query";
import { router, workspaceProcedure } from "../trpc";
import { entityTags, taggedEntityIds } from "./tags";
import type { Transaction } from "@emerge/db";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const jobInput = z.object({
  title: z.string().trim().min(1, "Job title is required").max(255),
  companyId: z.string().uuid("A client company is required"),
  hiringContactId: z.string().uuid().nullable().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  status: z.enum(jobStatus.enumValues).optional(),
  employmentType: z.enum(jobEmploymentType.enumValues).optional(),
  workMode: z.enum(jobWorkMode.enumValues).optional(),
  location: optionalText(255),
  description: optionalText(20000),
  clientCallSummary: optionalText(20000),
  requiredSkills: optionalText(5000),
  isHot: z.boolean().optional(),
  city: optionalText(120),
  state: optionalText(120),
  country: optionalText(120),
  postalCode: optionalText(20),
  targetCloseAt: z.coerce.date().nullable().optional(),
  positions: z.number().int().min(1).max(9999).optional(),
  salaryText: optionalText(120),
  salaryMin: z.number().int().min(0).nullable().optional(),
  salaryMax: z.number().int().min(0).nullable().optional(),
  salaryCurrency: optionalText(10),
  salaryPeriod: optionalText(20)
});

const ownerCols = { ownerName: users.name, ownerEmail: users.email };

/** Statuses that close a job; entering one stamps closedAt, leaving clears it (M17a). */
const CLOSED_STATUSES: ReadonlyArray<(typeof jobStatus.enumValues)[number]> = [
  "filled",
  "cancelled",
  "declined"
];

function isClosedStatus(status: (typeof jobStatus.enumValues)[number]): boolean {
  return CLOSED_STATUSES.includes(status);
}

/**
 * Structured filters shared by list and exportCsv (M17b). Every filter is
 * optional; the export endpoint honors exactly what the list shows.
 */
const jobListFilters = z.object({
  status: z.enum(jobStatus.enumValues).optional(),
  ownerId: z.string().uuid().optional(),
  companyId: z.string().uuid().optional(),
  country: z.string().trim().max(120).optional(),
  employmentType: z.enum(jobEmploymentType.enumValues).optional(),
  workMode: z.enum(jobWorkMode.enumValues).optional(),
  isHot: z.boolean().optional(),
  /** Preset "Recent": only jobs opened in the last N days. */
  openedWithinDays: z.number().int().min(1).max(365).optional()
});

type JobListFilters = z.infer<typeof jobListFilters>;

function jobFilterClauses(f: JobListFilters): (SQL | undefined)[] {
  return [
    f.status ? eq(jobs.status, f.status) : undefined,
    f.ownerId ? eq(jobs.ownerId, f.ownerId) : undefined,
    f.companyId ? eq(jobs.companyId, f.companyId) : undefined,
    // ilike without wildcards = case-insensitive equality for the dropdown value.
    f.country ? ilike(jobs.country, f.country) : undefined,
    f.employmentType ? eq(jobs.employmentType, f.employmentType) : undefined,
    f.workMode ? eq(jobs.workMode, f.workMode) : undefined,
    f.isHot ? eq(jobs.isHot, true) : undefined,
    f.openedWithinDays
      ? gte(jobs.openedAt, new Date(Date.now() - f.openedWithinDays * 86_400_000))
      : undefined
  ];
}

/** Sort/search whitelist shared by list and exportCsv. */
const JOB_LIST_OPTS = {
  sortable: {
    title: jobs.title,
    humanId: jobs.humanId,
    status: jobs.status,
    location: jobs.location,
    openedAt: jobs.openedAt,
    createdAt: jobs.createdAt,
    updatedAt: jobs.updatedAt
  },
  searchable: [jobs.title, jobs.humanId, jobs.location],
  defaultSort: "openedAt"
};

const bulkIds = z.array(z.string().uuid()).min(1).max(500);

function csvCell(v: string | number | boolean | Date | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Confirms the company exists in the workspace (and is not trashed). */
async function assertCompany(tx: Transaction, companyId: string): Promise<void> {
  const [company] = await tx
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.id, companyId), isNull(companies.deletedAt)));
  if (!company) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Client company not found" });
  }
}

/** Confirms the hiring contact belongs to the given company (when provided). */
async function assertHiringContact(
  tx: Transaction,
  contactId: string | null | undefined,
  companyId: string
): Promise<void> {
  if (!contactId) return;
  const [contact] = await tx
    .select({ id: contacts.id })
    .from(contacts)
    .where(
      and(eq(contacts.id, contactId), eq(contacts.companyId, companyId), isNull(contacts.deletedAt))
    );
  if (!contact) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "The hiring contact must belong to the selected company"
    });
  }
}

export const jobsRouter = router({
  list: workspaceProcedure
    .input(listInput.extend(jobListFilters.shape))
    .query(async ({ ctx, input }) => {
      const { orderBy, searchWhere, limit, offset } = buildListClauses(input, JOB_LIST_OPTS);
      const deletedWhere = input.deleted
        ? and(isNotNull(jobs.deletedAt), gte(jobs.deletedAt, trashCutoff()))
        : isNull(jobs.deletedAt);
      const tagWhere =
        input.tagIds && input.tagIds.length > 0
          ? inArray(jobs.id, taggedEntityIds(ctx.tx, "job", input.tagIds))
          : undefined;
      const where = and(deletedWhere, searchWhere, tagWhere, ...jobFilterClauses(input));

      const [rows, [totalRow]] = await Promise.all([
        ctx.tx
          .select({
            id: jobs.id,
            humanId: jobs.humanId,
            title: jobs.title,
            status: jobs.status,
            employmentType: jobs.employmentType,
            workMode: jobs.workMode,
            location: jobs.location,
            isHot: jobs.isHot,
            positions: jobs.positions,
            companyId: jobs.companyId,
            companyName: companies.name,
            ownerId: jobs.ownerId,
            openedAt: jobs.openedAt,
            targetCloseAt: jobs.targetCloseAt,
            closedAt: jobs.closedAt,
            deletedAt: jobs.deletedAt,
            createdAt: jobs.createdAt,
            updatedAt: jobs.updatedAt,
            ...ownerCols
          })
          .from(jobs)
          .leftJoin(companies, eq(companies.id, jobs.companyId))
          .leftJoin(users, eq(users.id, jobs.ownerId))
          .where(where)
          .orderBy(orderBy, asc(jobs.id))
          .limit(limit)
          .offset(offset),
        ctx.tx.select({ total: count() }).from(jobs).where(where)
      ]);
      return { rows, total: totalRow?.total ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [job] = await ctx.tx
        .select({
          id: jobs.id,
          humanId: jobs.humanId,
          title: jobs.title,
          companyId: jobs.companyId,
          companyName: companies.name,
          hiringContactId: jobs.hiringContactId,
          ownerId: jobs.ownerId,
          status: jobs.status,
          employmentType: jobs.employmentType,
          workMode: jobs.workMode,
          location: jobs.location,
          description: jobs.description,
          clientCallSummary: jobs.clientCallSummary,
          requiredSkills: jobs.requiredSkills,
          isHot: jobs.isHot,
          city: jobs.city,
          state: jobs.state,
          country: jobs.country,
          postalCode: jobs.postalCode,
          closedAt: jobs.closedAt,
          positions: jobs.positions,
          salaryText: jobs.salaryText,
          salaryMin: jobs.salaryMin,
          salaryMax: jobs.salaryMax,
          salaryCurrency: jobs.salaryCurrency,
          salaryPeriod: jobs.salaryPeriod,
          openedAt: jobs.openedAt,
          targetCloseAt: jobs.targetCloseAt,
          deletedAt: jobs.deletedAt,
          createdAt: jobs.createdAt,
          updatedAt: jobs.updatedAt,
          ...ownerCols
        })
        .from(jobs)
        .leftJoin(companies, eq(companies.id, jobs.companyId))
        .leftJoin(users, eq(users.id, jobs.ownerId))
        .where(eq(jobs.id, input.id));
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

      const [hiringContact, tags, files] = await Promise.all([
        job.hiringContactId
          ? ctx.tx
              .select({
                id: contacts.id,
                firstName: contacts.firstName,
                lastName: contacts.lastName,
                title: contacts.title,
                email: contacts.email
              })
              .from(contacts)
              .where(eq(contacts.id, job.hiringContactId))
              .then((r) => r[0] ?? null)
          : Promise.resolve(null),
        entityTags(ctx.tx, "job", job.id),
        ctx.tx
          .select({
            id: attachments.id,
            kind: attachments.kind,
            filename: attachments.filename,
            mime: attachments.mime,
            size: attachments.size,
            createdAt: attachments.createdAt
          })
          .from(attachments)
          .where(
            and(
              eq(attachments.entityType, "job"),
              eq(attachments.entityId, job.id),
              isNull(attachments.deletedAt)
            )
          )
          .orderBy(desc(attachments.createdAt))
      ]);

      // Real pipeline summary: live application counts by stage for this job.
      const stageRows = await ctx.tx
        .select({ stage: applications.stage, count: count() })
        .from(applications)
        .where(and(eq(applications.jobId, job.id), isNull(applications.deletedAt)))
        .groupBy(applications.stage);
      const counts = new Map(stageRows.map((r) => [r.stage, r.count]));
      const byStage = APPLICATION_STAGES.map((stage) => ({
        stage,
        count: counts.get(stage) ?? 0
      }));
      const pipeline = {
        total: stageRows.reduce((sum, r) => sum + r.count, 0),
        byStage
      };
      return { ...job, hiringContact, tags, attachments: files, pipeline };
    }),

  create: workspaceProcedure.input(jobInput).mutation(async ({ ctx, input }) => {
    await assertCompany(ctx.tx, input.companyId);
    await assertHiringContact(ctx.tx, input.hiringContactId, input.companyId);
    const next = await nextCounter(ctx.tx, ctx.workspaceId, "job");
    const [created] = await ctx.tx
      .insert(jobs)
      .values({
        workspaceId: ctx.workspaceId,
        humanId: humanId("JOB", next),
        title: input.title,
        companyId: input.companyId,
        hiringContactId: input.hiringContactId ?? null,
        ownerId: input.ownerId ?? ctx.session.user.id,
        status: input.status ?? "open",
        employmentType: input.employmentType ?? "permanent",
        workMode: input.workMode ?? "onsite",
        location: input.location ?? null,
        description: input.description ?? null,
        clientCallSummary: input.clientCallSummary ?? null,
        requiredSkills: input.requiredSkills ?? null,
        isHot: input.isHot ?? false,
        city: input.city ?? null,
        state: input.state ?? null,
        country: input.country ?? null,
        postalCode: input.postalCode ?? null,
        targetCloseAt: input.targetCloseAt ?? null,
        closedAt: isClosedStatus(input.status ?? "open") ? new Date() : null,
        positions: input.positions ?? 1,
        salaryText: input.salaryText ?? null,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        salaryCurrency: input.salaryCurrency ?? null,
        salaryPeriod: input.salaryPeriod ?? null
      })
      .returning();
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await writeAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.session.user.id,
      action: "job.created",
      targetType: "job",
      targetId: created.id,
      meta: { humanId: created.humanId, title: created.title }
    });

    // Notify the whole team about the new opening (M15). Delivery is queued;
    // a queue outage must never fail the job creation itself.
    try {
      const [recipients, [company]] = await Promise.all([
        ctx.tx
          .select({ email: users.email })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .where(
            and(
              eq(memberships.workspaceId, ctx.workspaceId),
              isNull(memberships.deactivatedAt),
              ne(memberships.userId, ctx.session.user.id)
            )
          ),
        ctx.tx
          .select({ name: companies.name })
          .from(companies)
          .where(eq(companies.id, created.companyId))
      ]);
      if (recipients.length > 0) {
        const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
        await enqueueEmail({
          type: "job-posted",
          to: recipients.map((r) => r.email),
          jobTitle: created.title,
          jobHumanId: created.humanId,
          companyName: company?.name ?? "Unknown client",
          location: created.location,
          employmentType: created.employmentType,
          workMode: created.workMode,
          positions: created.positions,
          postedByName: ctx.session.user.name,
          clientCallSummary: created.clientCallSummary,
          jobUrl: `${base}/jobs/${created.id}`
        });
      }
    } catch (err) {
      console.error("[jobs.create] job-posted email enqueue failed:", err);
    }
    return created;
  }),

  update: workspaceProcedure
    .input(z.object({ id: z.string().uuid(), patch: jobInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      // Re-validate company/contact coherence when either side changes.
      if ("companyId" in input.patch && input.patch.companyId) {
        await assertCompany(ctx.tx, input.patch.companyId);
      }
      if ("companyId" in input.patch || "hiringContactId" in input.patch) {
        const [current] = await ctx.tx
          .select({ companyId: jobs.companyId })
          .from(jobs)
          .where(and(eq(jobs.id, input.id), isNull(jobs.deletedAt)));
        if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        const companyId = input.patch.companyId ?? current.companyId;
        const contactId =
          "hiringContactId" in input.patch ? input.patch.hiringContactId : undefined;
        await assertHiringContact(ctx.tx, contactId, companyId);
      }
      // Entering a closed status stamps closedAt; leaving one clears it (M17a).
      let closedAtPatch: { closedAt: Date | null } | Record<string, never> = {};
      if (input.patch.status) {
        const [cur] = await ctx.tx
          .select({ closedAt: jobs.closedAt })
          .from(jobs)
          .where(and(eq(jobs.id, input.id), isNull(jobs.deletedAt)));
        if (!cur) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        closedAtPatch = {
          closedAt: isClosedStatus(input.patch.status) ? (cur.closedAt ?? new Date()) : null
        };
      }
      const [updated] = await ctx.tx
        .update(jobs)
        .set({ ...input.patch, ...closedAtPatch })
        .where(and(eq(jobs.id, input.id), isNull(jobs.deletedAt)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "job.updated",
        targetType: "job",
        targetId: updated.id,
        meta: { fields: Object.keys(input.patch) }
      });
      return updated;
    }),

  changeStatus: workspaceProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(jobStatus.enumValues) }))
    .mutation(async ({ ctx, input }) => {
      const [cur] = await ctx.tx
        .select({ closedAt: jobs.closedAt })
        .from(jobs)
        .where(and(eq(jobs.id, input.id), isNull(jobs.deletedAt)));
      if (!cur) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      const [updated] = await ctx.tx
        .update(jobs)
        .set({
          status: input.status,
          // Entering a closed status stamps closedAt; reopening clears it (M17a).
          closedAt: isClosedStatus(input.status) ? (cur.closedAt ?? new Date()) : null
        })
        .where(and(eq(jobs.id, input.id), isNull(jobs.deletedAt)))
        .returning({ id: jobs.id, humanId: jobs.humanId, status: jobs.status });
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "job.status_changed",
        targetType: "job",
        targetId: updated.id,
        meta: { humanId: updated.humanId, status: updated.status }
      });
      return updated;
    }),

  softDelete: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.tx
        .update(jobs)
        .set({ deletedAt: new Date() })
        .where(and(eq(jobs.id, input.id), isNull(jobs.deletedAt)))
        .returning({ id: jobs.id, humanId: jobs.humanId });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });

      // Zoho parity (M17a): trashing a job archives its live applications so
      // nothing keeps moving through a dead pipeline. History records why.
      const liveApps = await ctx.tx
        .select({
          id: applications.id,
          statusKey: applications.statusKey,
          stage: applications.stage
        })
        .from(applications)
        .where(
          and(
            eq(applications.jobId, input.id),
            isNull(applications.deletedAt),
            ne(applications.stage, "archived")
          )
        );
      if (liveApps.length > 0) {
        await ctx.tx
          .update(applications)
          .set({ stage: "archived", statusKey: "archived", stageEnteredAt: new Date() })
          .where(
            inArray(
              applications.id,
              liveApps.map((a) => a.id)
            )
          );
        await ctx.tx.insert(applicationStatusHistory).values(
          liveApps.map((a) => ({
            workspaceId: ctx.workspaceId,
            applicationId: a.id,
            fromStatusKey: a.statusKey,
            toStatusKey: "archived",
            fromStage: a.stage,
            toStage: "archived" as const,
            actorUserId: ctx.session.user.id,
            note: "Archived: job opening moved to trash"
          }))
        );
      }

      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "job.deleted",
        targetType: "job",
        targetId: deleted.id,
        meta: { humanId: deleted.humanId, archivedApplications: liveApps.length }
      });
      return deleted;
    }),

  restore: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [restored] = await ctx.tx
        .update(jobs)
        .set({ deletedAt: null })
        .where(
          and(eq(jobs.id, input.id), isNotNull(jobs.deletedAt), gte(jobs.deletedAt, trashCutoff()))
        )
        .returning({ id: jobs.id, humanId: jobs.humanId });
      if (!restored) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found in trash" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "job.restored",
        targetType: "job",
        targetId: restored.id,
        meta: { humanId: restored.humanId }
      });
      return restored;
    }),

  /**
   * Duplicate a job opening (M17c, Zoho Clone parity). Copies every content
   * field, resets status to open with a fresh human id and "(Copy)" title;
   * applications, notes and attachments are NOT copied.
   */
  duplicate: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [src] = await ctx.tx
        .select()
        .from(jobs)
        .where(and(eq(jobs.id, input.id), isNull(jobs.deletedAt)));
      if (!src) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
      const next = await nextCounter(ctx.tx, ctx.workspaceId, "job");
      const [created] = await ctx.tx
        .insert(jobs)
        .values({
          workspaceId: ctx.workspaceId,
          humanId: humanId("JOB", next),
          title: `${src.title} (Copy)`,
          companyId: src.companyId,
          hiringContactId: src.hiringContactId,
          ownerId: ctx.session.user.id,
          status: "open",
          employmentType: src.employmentType,
          workMode: src.workMode,
          location: src.location,
          description: src.description,
          clientCallSummary: src.clientCallSummary,
          requiredSkills: src.requiredSkills,
          isHot: src.isHot,
          city: src.city,
          state: src.state,
          country: src.country,
          postalCode: src.postalCode,
          targetCloseAt: src.targetCloseAt,
          positions: src.positions,
          salaryText: src.salaryText,
          salaryMin: src.salaryMin,
          salaryMax: src.salaryMax,
          salaryCurrency: src.salaryCurrency,
          salaryPeriod: src.salaryPeriod
        })
        .returning({ id: jobs.id, humanId: jobs.humanId });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "job.duplicated",
        targetType: "job",
        targetId: created.id,
        meta: { from: src.humanId, humanId: created.humanId }
      });
      return created;
    }),

  /** Distinct values that feed the list filter dropdowns (M17b). */
  filterOptions: workspaceProcedure.query(async ({ ctx }) => {
    const rows = await ctx.tx
      .selectDistinct({ country: jobs.country })
      .from(jobs)
      .where(and(isNull(jobs.deletedAt), isNotNull(jobs.country)))
      .orderBy(asc(jobs.country));
    return { countries: rows.map((r) => r.country).filter((c): c is string => Boolean(c)) };
  }),

  /** Bulk status change with the same closedAt semantics as changeStatus (M17b). */
  bulkChangeStatus: workspaceProcedure
    .input(z.object({ ids: bulkIds, status: z.enum(jobStatus.enumValues) }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.tx
        .update(jobs)
        .set({
          status: input.status,
          // Entering a closed status keeps an existing stamp, else stamps now;
          // reopening clears it. COALESCE keeps this a single bulk statement.
          closedAt: isClosedStatus(input.status) ? sql`COALESCE(${jobs.closedAt}, NOW())` : null
        })
        .where(and(inArray(jobs.id, input.ids), isNull(jobs.deletedAt)))
        .returning({ id: jobs.id });
      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No matching jobs found" });
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "job.bulk_status_changed",
        targetType: "job",
        targetId: updated[0]!.id,
        meta: { count: updated.length, status: input.status }
      });
      return { updated: updated.length };
    }),

  /** Bulk owner reassignment (Zoho "Mass Transfer" parity, M17b). */
  bulkReassignOwner: workspaceProcedure
    .input(z.object({ ids: bulkIds, ownerId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [member] = await ctx.tx
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(
          and(
            eq(memberships.workspaceId, ctx.workspaceId),
            eq(memberships.userId, input.ownerId),
            isNull(memberships.deactivatedAt)
          )
        );
      if (!member) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The new owner must be an active team member"
        });
      }
      const updated = await ctx.tx
        .update(jobs)
        .set({ ownerId: input.ownerId })
        .where(and(inArray(jobs.id, input.ids), isNull(jobs.deletedAt)))
        .returning({ id: jobs.id });
      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No matching jobs found" });
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "job.bulk_owner_reassigned",
        targetType: "job",
        targetId: updated[0]!.id,
        meta: { count: updated.length, ownerId: input.ownerId }
      });
      return { updated: updated.length };
    }),

  /** Bulk update of a safe field subset (Zoho "Update Fields" parity, M17b). */
  bulkUpdateFields: workspaceProcedure
    .input(
      z.object({
        ids: bulkIds,
        patch: z
          .object({
            employmentType: z.enum(jobEmploymentType.enumValues).optional(),
            workMode: z.enum(jobWorkMode.enumValues).optional(),
            isHot: z.boolean().optional(),
            targetCloseAt: z.coerce.date().nullable().optional()
          })
          .refine((p) => Object.keys(p).length > 0, {
            message: "Pick at least one field to update"
          })
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.tx
        .update(jobs)
        .set(input.patch)
        .where(and(inArray(jobs.id, input.ids), isNull(jobs.deletedAt)))
        .returning({ id: jobs.id });
      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No matching jobs found" });
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "job.bulk_fields_updated",
        targetType: "job",
        targetId: updated[0]!.id,
        meta: { count: updated.length, fields: Object.keys(input.patch) }
      });
      return { updated: updated.length };
    }),

  /**
   * Server-side CSV export honoring the full current filter set (search, tags,
   * every structured filter, sort). Exports the whole result set, not just the
   * visible page, capped at 10,000 rows (M17b).
   */
  exportCsv: workspaceProcedure
    .input(listInput.omit({ page: true, pageSize: true }).extend(jobListFilters.shape))
    .query(async ({ ctx, input }) => {
      const { orderBy, searchWhere } = buildListClauses(
        { ...input, page: 1, pageSize: 50 },
        JOB_LIST_OPTS
      );
      const deletedWhere = input.deleted
        ? and(isNotNull(jobs.deletedAt), gte(jobs.deletedAt, trashCutoff()))
        : isNull(jobs.deletedAt);
      const tagWhere =
        input.tagIds && input.tagIds.length > 0
          ? inArray(jobs.id, taggedEntityIds(ctx.tx, "job", input.tagIds))
          : undefined;
      const where = and(deletedWhere, searchWhere, tagWhere, ...jobFilterClauses(input));

      const rows = await ctx.tx
        .select({
          humanId: jobs.humanId,
          title: jobs.title,
          companyName: companies.name,
          status: jobs.status,
          employmentType: jobs.employmentType,
          workMode: jobs.workMode,
          location: jobs.location,
          city: jobs.city,
          country: jobs.country,
          positions: jobs.positions,
          isHot: jobs.isHot,
          ownerName: users.name,
          openedAt: jobs.openedAt,
          targetCloseAt: jobs.targetCloseAt,
          closedAt: jobs.closedAt
        })
        .from(jobs)
        .leftJoin(companies, eq(companies.id, jobs.companyId))
        .leftJoin(users, eq(users.id, jobs.ownerId))
        .where(where)
        .orderBy(orderBy, asc(jobs.id))
        .limit(10000);

      const header = [
        "ID",
        "Title",
        "Client",
        "Status",
        "Employment type",
        "Work mode",
        "Location",
        "City",
        "Country",
        "Positions",
        "Hot",
        "Owner",
        "Opened",
        "Target date",
        "Closed"
      ].join(",");
      const lines = rows.map((r) =>
        [
          r.humanId,
          r.title,
          r.companyName,
          r.status,
          r.employmentType,
          r.workMode,
          r.location,
          r.city,
          r.country,
          r.positions,
          r.isHot ? "yes" : "no",
          r.ownerName,
          r.openedAt,
          r.targetCloseAt,
          r.closedAt
        ]
          .map(csvCell)
          .join(",")
      );
      return { csv: [header, ...lines].join("\r\n"), count: rows.length };
    }),

  /**
   * CSV import of job openings (M17b, mirrors candidates import). Rows are
   * pre-mapped on the client; this validates enums, resolves the client company
   * by name (optionally creating missing ones) and inserts with sequential
   * human ids. `dryRun` returns the same report without writing.
   */
  importJobs: workspaceProcedure
    .input(
      z.object({
        rows: z
          .array(z.record(z.string(), z.string()))
          .max(2000, "Import is limited to 2,000 rows per run"),
        createMissingCompanies: z.boolean().default(true),
        dryRun: z.boolean().default(false)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const errors: { row: number; message: string }[] = [];
      const statusSet = new Set<string>(jobStatus.enumValues);
      const empSet = new Set<string>(jobEmploymentType.enumValues);
      const modeSet = new Set<string>(jobWorkMode.enumValues);
      const normEnum = (v: string) =>
        v
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_");

      type Prepared = {
        row: number;
        companyName: string;
        values: {
          title: string;
          status: (typeof jobStatus.enumValues)[number];
          employmentType: (typeof jobEmploymentType.enumValues)[number];
          workMode: (typeof jobWorkMode.enumValues)[number];
          location: string | null;
          city: string | null;
          country: string | null;
          positions: number;
          salaryText: string | null;
          description: string | null;
          requiredSkills: string | null;
          targetCloseAt: Date | null;
          isHot: boolean;
        };
      };
      const prepared: Prepared[] = [];

      input.rows.forEach((raw, i) => {
        const rowNum = i + 1;
        const pick = (k: string) => {
          const v = raw[k]?.trim();
          return v ? v : null;
        };
        const title = pick("title");
        if (!title) {
          errors.push({ row: rowNum, message: "Missing job title" });
          return;
        }
        const companyName = pick("companyName");
        if (!companyName) {
          errors.push({ row: rowNum, message: "Missing client company" });
          return;
        }
        const rawStatus = pick("status");
        const status = rawStatus ? normEnum(rawStatus) : "open";
        if (!statusSet.has(status)) {
          errors.push({ row: rowNum, message: `Unknown status "${rawStatus}"` });
          return;
        }
        const rawEmp = pick("employmentType");
        const employmentType = rawEmp ? normEnum(rawEmp) : "permanent";
        if (!empSet.has(employmentType)) {
          errors.push({ row: rowNum, message: `Unknown employment type "${rawEmp}"` });
          return;
        }
        const rawMode = pick("workMode");
        const workMode = rawMode ? normEnum(rawMode) : "onsite";
        if (!modeSet.has(workMode)) {
          errors.push({ row: rowNum, message: `Unknown work mode "${rawMode}"` });
          return;
        }
        const rawPositions = pick("positions");
        const positions = rawPositions ? Number.parseInt(rawPositions, 10) : 1;
        if (!Number.isInteger(positions) || positions < 1 || positions > 9999) {
          errors.push({ row: rowNum, message: `Invalid positions "${rawPositions}"` });
          return;
        }
        const rawTarget = pick("targetDate");
        let targetCloseAt: Date | null = null;
        if (rawTarget) {
          const d = new Date(rawTarget);
          if (Number.isNaN(d.getTime())) {
            errors.push({ row: rowNum, message: `Invalid target date "${rawTarget}"` });
            return;
          }
          targetCloseAt = d;
        }
        const rawHot = pick("isHot")?.toLowerCase() ?? null;
        prepared.push({
          row: rowNum,
          companyName,
          values: {
            title,
            status: status as (typeof jobStatus.enumValues)[number],
            employmentType: employmentType as (typeof jobEmploymentType.enumValues)[number],
            workMode: workMode as (typeof jobWorkMode.enumValues)[number],
            location: pick("location"),
            city: pick("city"),
            country: pick("country"),
            positions,
            salaryText: pick("salaryText"),
            description: pick("description"),
            requiredSkills: pick("requiredSkills"),
            targetCloseAt,
            isHot: rawHot === "yes" || rawHot === "true" || rawHot === "1"
          }
        });
      });

      // Resolve client companies by case-insensitive name.
      const existing = await ctx.tx
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(isNull(companies.deletedAt));
      const companyByName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));
      const missingNames = [
        ...new Set(
          prepared
            .map((p) => p.companyName)
            .filter((n) => !companyByName.has(n.trim().toLowerCase()))
        )
      ];

      let importable = prepared;
      if (!input.createMissingCompanies && missingNames.length > 0) {
        const missingSet = new Set(missingNames.map((n) => n.trim().toLowerCase()));
        importable = prepared.filter((p) => {
          if (missingSet.has(p.companyName.trim().toLowerCase())) {
            errors.push({ row: p.row, message: `Client company "${p.companyName}" not found` });
            return false;
          }
          return true;
        });
      }

      const report = {
        total: input.rows.length,
        valid: importable.length,
        created: importable.length,
        companiesCreated: input.createMissingCompanies ? missingNames.length : 0,
        errors,
        dryRun: input.dryRun
      };
      if (input.dryRun || importable.length === 0) return report;

      if (input.createMissingCompanies && missingNames.length > 0) {
        const inserted = await ctx.tx
          .insert(companies)
          .values(
            missingNames.map((name) => ({
              workspaceId: ctx.workspaceId,
              name,
              status: "prospect" as const,
              ownerId: ctx.session.user.id
            }))
          )
          .returning({ id: companies.id, name: companies.name });
        for (const c of inserted) companyByName.set(c.name.trim().toLowerCase(), c.id);
      }

      // Reserve the whole human-id block in one statement, then batch-insert.
      const top = await bumpCounter(ctx.tx, ctx.workspaceId, "job", importable.length);
      const first = top - importable.length + 1;
      const created = await ctx.tx
        .insert(jobs)
        .values(
          importable.map((p, i) => ({
            workspaceId: ctx.workspaceId,
            humanId: humanId("JOB", first + i),
            companyId: companyByName.get(p.companyName.trim().toLowerCase())!,
            ownerId: ctx.session.user.id,
            ...p.values,
            closedAt: isClosedStatus(p.values.status) ? new Date() : null
          }))
        )
        .returning({ id: jobs.id });

      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "job.imported",
        targetType: "job",
        targetId: created[0]?.id ?? "",
        meta: {
          count: created.length,
          companiesCreated: input.createMissingCompanies ? missingNames.length : 0
        }
      });
      return { ...report, created: created.length };
    })
});
