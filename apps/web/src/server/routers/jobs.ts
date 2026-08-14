import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, gte, isNull, isNotNull } from "drizzle-orm";
import { z } from "zod";
import {
  applications,
  companies,
  contacts,
  jobEmploymentType,
  jobStatus,
  jobWorkMode,
  jobs,
  users
} from "@emerge/db";
import { APPLICATION_STAGES } from "@/lib/applications";
import { writeAudit } from "../audit";
import { humanId, nextCounter } from "../counters";
import { buildListClauses, listInput, trashCutoff } from "../list-query";
import { router, workspaceProcedure } from "../trpc";
import { entityTags } from "./tags";
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
  positions: z.number().int().min(1).max(9999).optional(),
  salaryText: optionalText(120),
  salaryMin: z.number().int().min(0).nullable().optional(),
  salaryMax: z.number().int().min(0).nullable().optional(),
  salaryCurrency: optionalText(10),
  salaryPeriod: optionalText(20)
});

const ownerCols = { ownerName: users.name, ownerEmail: users.email };

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
  list: workspaceProcedure.input(listInput).query(async ({ ctx, input }) => {
    const { orderBy, searchWhere, limit, offset } = buildListClauses(input, {
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
    });
    const deletedWhere = input.deleted
      ? and(isNotNull(jobs.deletedAt), gte(jobs.deletedAt, trashCutoff()))
      : isNull(jobs.deletedAt);
    const where = and(deletedWhere, searchWhere);

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
          positions: jobs.positions,
          companyId: jobs.companyId,
          companyName: companies.name,
          ownerId: jobs.ownerId,
          openedAt: jobs.openedAt,
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

      const [hiringContact, tags] = await Promise.all([
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
        entityTags(ctx.tx, "job", job.id)
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
      return { ...job, hiringContact, tags, pipeline };
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
      const [updated] = await ctx.tx
        .update(jobs)
        .set({ ...input.patch })
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
      const [updated] = await ctx.tx
        .update(jobs)
        .set({ status: input.status })
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
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "job.deleted",
        targetType: "job",
        targetId: deleted.id,
        meta: { humanId: deleted.humanId }
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
    })
});
