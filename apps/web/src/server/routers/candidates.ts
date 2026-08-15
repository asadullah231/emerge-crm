import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, inArray, isNull, isNotNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import {
  applications,
  attachments,
  candidateEducation,
  candidateExperience,
  candidateSource,
  candidates,
  jobs,
  users
} from "@emerge/db";
import { writeAudit } from "../audit";
import { bumpCounter, humanId, nextCounter } from "../counters";
import { buildListClauses, listInput, trashCutoff } from "../list-query";
import { router, workspaceProcedure } from "../trpc";
import { entityTags, taggedEntityIds } from "./tags";

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const optionalEmail = z
  .string()
  .trim()
  .email()
  .max(255)
  .nullable()
  .optional()
  .or(z.literal("").transform(() => null));

const candidateInput = z.object({
  firstName: optionalText(125),
  lastName: z.string().trim().min(1, "Last name is required").max(125),
  title: optionalText(150),
  currentEmployer: optionalText(150),
  email: optionalEmail,
  secondaryEmail: optionalEmail,
  phone: optionalText(50),
  mobile: optionalText(50),
  city: optionalText(120),
  country: optionalText(120),
  linkedinUrl: optionalText(255),
  websiteUrl: optionalText(255),
  skills: optionalText(5000),
  experienceYears: z.number().int().min(0).max(80).nullable().optional(),
  salaryText: optionalText(120),
  salaryMin: z.number().int().min(0).nullable().optional(),
  salaryMax: z.number().int().min(0).nullable().optional(),
  salaryCurrency: optionalText(10),
  noticePeriod: optionalText(120),
  source: z.enum(candidateSource.enumValues).optional(),
  ownerId: z.string().uuid().nullable().optional()
});

const ownerCols = { ownerName: users.name, ownerEmail: users.email };

function lower(value: string | null | undefined): string | null {
  return value ? value.toLowerCase() : null;
}

export const candidatesRouter = router({
  list: workspaceProcedure.input(listInput).query(async ({ ctx, input }) => {
    const { orderBy, searchWhere, limit, offset } = buildListClauses(input, {
      sortable: {
        lastName: candidates.lastName,
        humanId: candidates.humanId,
        title: candidates.title,
        email: candidates.email,
        source: candidates.source,
        createdAt: candidates.createdAt,
        updatedAt: candidates.updatedAt
      },
      searchable: [
        candidates.firstName,
        candidates.lastName,
        candidates.email,
        candidates.title,
        candidates.currentEmployer,
        candidates.humanId
      ],
      defaultSort: "lastName"
    });
    const deletedWhere = input.deleted
      ? and(isNotNull(candidates.deletedAt), gte(candidates.deletedAt, trashCutoff()))
      : isNull(candidates.deletedAt);
    const tagWhere =
      input.tagIds && input.tagIds.length > 0
        ? inArray(candidates.id, taggedEntityIds(ctx.tx, "candidate", input.tagIds))
        : undefined;
    const where = and(deletedWhere, searchWhere, tagWhere);

    const [rows, [totalRow]] = await Promise.all([
      ctx.tx
        .select({
          id: candidates.id,
          humanId: candidates.humanId,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          title: candidates.title,
          currentEmployer: candidates.currentEmployer,
          email: candidates.email,
          city: candidates.city,
          country: candidates.country,
          source: candidates.source,
          ownerId: candidates.ownerId,
          deletedAt: candidates.deletedAt,
          createdAt: candidates.createdAt,
          updatedAt: candidates.updatedAt,
          ...ownerCols
        })
        .from(candidates)
        .leftJoin(users, eq(users.id, candidates.ownerId))
        .where(where)
        .orderBy(orderBy, asc(candidates.id))
        .limit(limit)
        .offset(offset),
      ctx.tx.select({ total: count() }).from(candidates).where(where)
    ]);
    return { rows, total: totalRow?.total ?? 0, page: input.page, pageSize: input.pageSize };
  }),

  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [candidate] = await ctx.tx
        .select({
          id: candidates.id,
          humanId: candidates.humanId,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          title: candidates.title,
          currentEmployer: candidates.currentEmployer,
          email: candidates.email,
          secondaryEmail: candidates.secondaryEmail,
          phone: candidates.phone,
          mobile: candidates.mobile,
          city: candidates.city,
          country: candidates.country,
          linkedinUrl: candidates.linkedinUrl,
          websiteUrl: candidates.websiteUrl,
          skills: candidates.skills,
          experienceYears: candidates.experienceYears,
          salaryText: candidates.salaryText,
          salaryMin: candidates.salaryMin,
          salaryMax: candidates.salaryMax,
          salaryCurrency: candidates.salaryCurrency,
          noticePeriod: candidates.noticePeriod,
          source: candidates.source,
          ownerId: candidates.ownerId,
          deletedAt: candidates.deletedAt,
          createdAt: candidates.createdAt,
          updatedAt: candidates.updatedAt,
          ...ownerCols
        })
        .from(candidates)
        .leftJoin(users, eq(users.id, candidates.ownerId))
        .where(eq(candidates.id, input.id));
      if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });

      const [education, experience, files, tags] = await Promise.all([
        ctx.tx
          .select()
          .from(candidateEducation)
          .where(eq(candidateEducation.candidateId, candidate.id))
          .orderBy(asc(candidateEducation.sortOrder), desc(candidateEducation.endYear)),
        ctx.tx
          .select()
          .from(candidateExperience)
          .where(eq(candidateExperience.candidateId, candidate.id))
          .orderBy(asc(candidateExperience.sortOrder), desc(candidateExperience.startDate)),
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
              eq(attachments.entityType, "candidate"),
              eq(attachments.entityId, candidate.id),
              isNull(attachments.deletedAt)
            )
          )
          .orderBy(desc(attachments.createdAt)),
        entityTags(ctx.tx, "candidate", candidate.id)
      ]);

      // Applications this candidate is on (which jobs, what stage). M5.
      const applicationRows = await ctx.tx
        .select({
          id: applications.id,
          humanId: applications.humanId,
          stage: applications.stage,
          statusKey: applications.statusKey,
          jobId: applications.jobId,
          jobTitle: jobs.title,
          jobHumanId: jobs.humanId,
          stageEnteredAt: applications.stageEnteredAt
        })
        .from(applications)
        .innerJoin(jobs, eq(jobs.id, applications.jobId))
        .where(and(eq(applications.candidateId, candidate.id), isNull(applications.deletedAt)))
        .orderBy(desc(applications.stageEnteredAt));
      return {
        ...candidate,
        education,
        experience,
        attachments: files,
        tags,
        applications: applicationRows
      };
    }),

  /** Pre-create duplicate check by email. Warns, never blocks. */
  duplicates: workspaceProcedure
    .input(
      z.object({
        email: z.string().trim().max(255).optional(),
        excludeId: z.string().uuid().optional()
      })
    )
    .query(async ({ ctx, input }) => {
      const email = lower(input.email);
      if (!email) return [];
      return ctx.tx
        .select({
          id: candidates.id,
          humanId: candidates.humanId,
          firstName: candidates.firstName,
          lastName: candidates.lastName,
          email: candidates.email
        })
        .from(candidates)
        .where(
          and(
            isNull(candidates.deletedAt),
            or(eq(candidates.email, email), eq(candidates.secondaryEmail, email)),
            input.excludeId ? ne(candidates.id, input.excludeId) : undefined
          )
        )
        .limit(5);
    }),

  create: workspaceProcedure.input(candidateInput).mutation(async ({ ctx, input }) => {
    const next = await nextCounter(ctx.tx, ctx.workspaceId, "candidate");
    const [created] = await ctx.tx
      .insert(candidates)
      .values({
        workspaceId: ctx.workspaceId,
        humanId: humanId("CAND", next),
        firstName: input.firstName ?? null,
        lastName: input.lastName,
        title: input.title ?? null,
        currentEmployer: input.currentEmployer ?? null,
        email: lower(input.email),
        secondaryEmail: lower(input.secondaryEmail),
        phone: input.phone ?? null,
        mobile: input.mobile ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        linkedinUrl: input.linkedinUrl ?? null,
        websiteUrl: input.websiteUrl ?? null,
        skills: input.skills ?? null,
        experienceYears: input.experienceYears ?? null,
        salaryText: input.salaryText ?? null,
        salaryMin: input.salaryMin ?? null,
        salaryMax: input.salaryMax ?? null,
        salaryCurrency: input.salaryCurrency ?? null,
        noticePeriod: input.noticePeriod ?? null,
        source: input.source ?? "manual",
        ownerId: input.ownerId ?? ctx.session.user.id
      })
      .returning();
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await writeAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.session.user.id,
      action: "candidate.created",
      targetType: "candidate",
      targetId: created.id,
      meta: {
        humanId: created.humanId,
        name: [created.firstName, created.lastName].filter(Boolean).join(" ")
      }
    });
    return created;
  }),

  update: workspaceProcedure
    .input(z.object({ id: z.string().uuid(), patch: candidateInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = { ...input.patch };
      if ("email" in patch) patch.email = lower(input.patch.email);
      if ("secondaryEmail" in patch) patch.secondaryEmail = lower(input.patch.secondaryEmail);
      const [updated] = await ctx.tx
        .update(candidates)
        .set(patch)
        .where(and(eq(candidates.id, input.id), isNull(candidates.deletedAt)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "candidate.updated",
        targetType: "candidate",
        targetId: updated.id,
        meta: { fields: Object.keys(input.patch) }
      });
      return updated;
    }),

  softDelete: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.tx
        .update(candidates)
        .set({ deletedAt: new Date() })
        .where(and(eq(candidates.id, input.id), isNull(candidates.deletedAt)))
        .returning({ id: candidates.id, humanId: candidates.humanId });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "candidate.deleted",
        targetType: "candidate",
        targetId: deleted.id,
        meta: { humanId: deleted.humanId }
      });
      return deleted;
    }),

  restore: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [restored] = await ctx.tx
        .update(candidates)
        .set({ deletedAt: null })
        .where(
          and(
            eq(candidates.id, input.id),
            isNotNull(candidates.deletedAt),
            gte(candidates.deletedAt, trashCutoff())
          )
        )
        .returning({ id: candidates.id, humanId: candidates.humanId });
      if (!restored) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Candidate not found in trash" });
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "candidate.restored",
        targetType: "candidate",
        targetId: restored.id,
        meta: { humanId: restored.humanId }
      });
      return restored;
    }),

  /**
   * Folds `sourceId` into `targetId`: the target keeps its own non-empty
   * fields and fills blanks from the source; education, experience and
   * attachments re-parent to the target; the source is soft-deleted.
   */
  merge: workspaceProcedure
    .input(z.object({ targetId: z.string().uuid(), sourceId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.targetId === input.sourceId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot merge a candidate into itself"
        });
      }
      const [target, source] = await Promise.all([
        ctx.tx
          .select()
          .from(candidates)
          .where(and(eq(candidates.id, input.targetId), isNull(candidates.deletedAt)))
          .then((r) => r[0]),
        ctx.tx
          .select()
          .from(candidates)
          .where(and(eq(candidates.id, input.sourceId), isNull(candidates.deletedAt)))
          .then((r) => r[0])
      ]);
      if (!target || !source) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Both candidates must exist" });
      }

      // Fill only the target's empty fields from the source (target wins).
      const fillable = [
        "firstName",
        "title",
        "currentEmployer",
        "email",
        "secondaryEmail",
        "phone",
        "mobile",
        "city",
        "country",
        "linkedinUrl",
        "websiteUrl",
        "skills",
        "experienceYears",
        "salaryText",
        "salaryMin",
        "salaryMax",
        "salaryCurrency",
        "noticePeriod"
      ] as const;
      const patch: Record<string, unknown> = {};
      for (const key of fillable) {
        const targetVal = target[key];
        const sourceVal = source[key];
        if (
          (targetVal === null || targetVal === undefined) &&
          sourceVal !== null &&
          sourceVal !== undefined
        ) {
          patch[key] = sourceVal;
        }
      }
      if (Object.keys(patch).length > 0) {
        await ctx.tx.update(candidates).set(patch).where(eq(candidates.id, target.id));
      }

      // Re-parent children and the source's attachments to the target.
      await Promise.all([
        ctx.tx
          .update(candidateEducation)
          .set({ candidateId: target.id })
          .where(eq(candidateEducation.candidateId, source.id)),
        ctx.tx
          .update(candidateExperience)
          .set({ candidateId: target.id })
          .where(eq(candidateExperience.candidateId, source.id)),
        ctx.tx
          .update(attachments)
          .set({ entityId: target.id })
          .where(and(eq(attachments.entityType, "candidate"), eq(attachments.entityId, source.id)))
      ]);

      await ctx.tx
        .update(candidates)
        .set({ deletedAt: new Date() })
        .where(eq(candidates.id, source.id));

      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "candidate.merged",
        targetType: "candidate",
        targetId: target.id,
        meta: { mergedFrom: source.humanId, filledFields: Object.keys(patch) }
      });
      return { id: target.id, filledFields: Object.keys(patch) };
    }),

  /**
   * Day-one CSV import of candidates. Rows are pre-mapped on the client to
   * candidate fields; this validates, dedupes by lowercased email, and either
   * skips or updates existing matches. `dryRun` returns the same report without
   * writing. The heavy streaming/relationship importer is M8.
   */
  importCandidates: workspaceProcedure
    .input(
      z.object({
        rows: z
          .array(z.record(z.string(), z.string()))
          .max(5000, "Import is limited to 5,000 rows per run"),
        dedupeMode: z.enum(["skip", "update"]).default("skip"),
        dryRun: z.boolean().default(false)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const errors: { row: number; message: string }[] = [];
      const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      const seenEmails = new Set<string>();

      type Prepared = {
        row: number;
        email: string | null;
        values: {
          firstName: string | null;
          lastName: string;
          email: string | null;
          phone: string | null;
          mobile: string | null;
          title: string | null;
          currentEmployer: string | null;
          city: string | null;
          country: string | null;
          skills: string | null;
        };
      };
      const prepared: Prepared[] = [];

      input.rows.forEach((raw, i) => {
        const rowNum = i + 1;
        const pick = (k: string) => {
          const v = raw[k]?.trim();
          return v ? v : null;
        };
        const lastName = raw.lastName?.trim();
        if (!lastName) {
          errors.push({ row: rowNum, message: "Missing last name" });
          return;
        }
        const email = raw.email ? raw.email.trim().toLowerCase() : null;
        if (email && !emailRe.test(email)) {
          errors.push({ row: rowNum, message: `Invalid email "${raw.email}"` });
          return;
        }
        if (email && seenEmails.has(email)) {
          errors.push({ row: rowNum, message: `Duplicate email within file: ${email}` });
          return;
        }
        if (email) seenEmails.add(email);
        prepared.push({
          row: rowNum,
          email,
          values: {
            firstName: pick("firstName"),
            lastName,
            email,
            phone: pick("phone"),
            mobile: pick("mobile"),
            title: pick("title"),
            currentEmployer: pick("currentEmployer"),
            city: pick("city"),
            country: pick("country"),
            skills: pick("skills")
          }
        });
      });

      // Match against existing candidates by email (candidates.email is stored lowercased).
      const emails = prepared.map((p) => p.email).filter((e): e is string => e !== null);
      const existing =
        emails.length > 0
          ? await ctx.tx
              .select({ id: candidates.id, email: candidates.email })
              .from(candidates)
              .where(and(isNull(candidates.deletedAt), inArray(candidates.email, emails)))
          : [];
      const existingByEmail = new Map(existing.map((e) => [e.email, e.id] as const));

      const toCreate = prepared.filter((p) => !p.email || !existingByEmail.has(p.email));
      const toMatch = prepared.filter((p) => p.email && existingByEmail.has(p.email));
      const willUpdate = input.dedupeMode === "update" ? toMatch.length : 0;
      const willSkip = input.dedupeMode === "skip" ? toMatch.length : 0;

      const report = {
        total: input.rows.length,
        valid: prepared.length,
        created: toCreate.length,
        updated: willUpdate,
        skipped: willSkip,
        errors,
        dryRun: input.dryRun
      };
      if (input.dryRun) return report;

      // Allocate a contiguous human-id block for the new candidates.
      if (toCreate.length > 0) {
        const top = await bumpCounter(ctx.tx, ctx.workspaceId, "candidate", toCreate.length);
        const base = top - toCreate.length;
        await ctx.tx.insert(candidates).values(
          toCreate.map((p, idx) => ({
            workspaceId: ctx.workspaceId,
            humanId: humanId("CAND", base + idx + 1),
            ...p.values,
            source: "import" as const,
            ownerId: ctx.session.user.id
          }))
        );
      }

      if (input.dedupeMode === "update") {
        for (const p of toMatch) {
          const targetId = existingByEmail.get(p.email!)!;
          // Only overwrite with non-empty imported values.
          const patch: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(p.values)) {
            if (v !== null && k !== "email") patch[k] = v;
          }
          if (Object.keys(patch).length > 0) {
            await ctx.tx.update(candidates).set(patch).where(eq(candidates.id, targetId));
          }
        }
      }

      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "candidate.imported",
        targetType: "candidate",
        meta: { created: report.created, updated: report.updated, skipped: report.skipped }
      });
      return report;
    }),

  // --- Education sub-records ----------------------------------------------

  addEducation: workspaceProcedure
    .input(
      z.object({
        candidateId: z.string().uuid(),
        institution: optionalText(200),
        degree: optionalText(150),
        fieldOfStudy: optionalText(150),
        startYear: z.number().int().min(1900).max(2100).nullable().optional(),
        endYear: z.number().int().min(1900).max(2100).nullable().optional()
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .insert(candidateEducation)
        .values({
          workspaceId: ctx.workspaceId,
          candidateId: input.candidateId,
          institution: input.institution ?? null,
          degree: input.degree ?? null,
          fieldOfStudy: input.fieldOfStudy ?? null,
          startYear: input.startYear ?? null,
          endYear: input.endYear ?? null
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return row;
    }),

  updateEducation: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        patch: z.object({
          institution: optionalText(200),
          degree: optionalText(150),
          fieldOfStudy: optionalText(150),
          startYear: z.number().int().min(1900).max(2100).nullable().optional(),
          endYear: z.number().int().min(1900).max(2100).nullable().optional()
        })
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .update(candidateEducation)
        .set(input.patch)
        .where(eq(candidateEducation.id, input.id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Education entry not found" });
      return row;
    }),

  removeEducation: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.tx.delete(candidateEducation).where(eq(candidateEducation.id, input.id));
      return { id: input.id };
    }),

  // --- Experience sub-records ---------------------------------------------

  addExperience: workspaceProcedure
    .input(
      z.object({
        candidateId: z.string().uuid(),
        company: optionalText(200),
        title: optionalText(150),
        startDate: optionalText(50),
        endDate: optionalText(50),
        isCurrent: z.boolean().optional(),
        summary: optionalText(2000)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .insert(candidateExperience)
        .values({
          workspaceId: ctx.workspaceId,
          candidateId: input.candidateId,
          company: input.company ?? null,
          title: input.title ?? null,
          startDate: input.startDate ?? null,
          endDate: input.endDate ?? null,
          isCurrent: input.isCurrent ?? false,
          summary: input.summary ?? null
        })
        .returning();
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return row;
    }),

  updateExperience: workspaceProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        patch: z.object({
          company: optionalText(200),
          title: optionalText(150),
          startDate: optionalText(50),
          endDate: optionalText(50),
          isCurrent: z.boolean().optional(),
          summary: optionalText(2000)
        })
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.tx
        .update(candidateExperience)
        .set(input.patch)
        .where(eq(candidateExperience.id, input.id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Experience entry not found" });
      return row;
    }),

  removeExperience: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.tx.delete(candidateExperience).where(eq(candidateExperience.id, input.id));
      return { id: input.id };
    })
});
