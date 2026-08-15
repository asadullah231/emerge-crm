import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNull, isNotNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { companies, companyStatus, contacts, users } from "@emerge/db";
import { writeAudit } from "../audit";
import { buildListClauses, listInput, normalizeDomain, trashCutoff } from "../list-query";
import { router, workspaceProcedure } from "../trpc";
import { entityTags, taggedEntityIds } from "./tags";

const companyInput = z.object({
  name: z.string().trim().min(1, "Company name is required").max(255),
  website: z.string().trim().max(255).nullable().optional(),
  industry: z.string().trim().max(120).nullable().optional(),
  size: z.string().trim().max(50).nullable().optional(),
  location: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(50).nullable().optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(companyStatus.enumValues).optional(),
  ownerId: z.string().uuid().nullable().optional()
});

const ownerCols = { ownerName: users.name, ownerEmail: users.email };

export const companiesRouter = router({
  list: workspaceProcedure.input(listInput).query(async ({ ctx, input }) => {
    const { orderBy, searchWhere, limit, offset } = buildListClauses(input, {
      sortable: {
        name: companies.name,
        industry: companies.industry,
        location: companies.location,
        status: companies.status,
        createdAt: companies.createdAt,
        updatedAt: companies.updatedAt
      },
      searchable: [companies.name, companies.domain, companies.industry, companies.location],
      defaultSort: "name"
    });
    const deletedWhere = input.deleted
      ? and(isNotNull(companies.deletedAt), gte(companies.deletedAt, trashCutoff()))
      : isNull(companies.deletedAt);
    const tagWhere =
      input.tagIds && input.tagIds.length > 0
        ? inArray(companies.id, taggedEntityIds(ctx.tx, "company", input.tagIds))
        : undefined;
    const where = and(deletedWhere, searchWhere, tagWhere);

    const [rows, [totalRow]] = await Promise.all([
      ctx.tx
        .select({
          id: companies.id,
          name: companies.name,
          website: companies.website,
          domain: companies.domain,
          industry: companies.industry,
          size: companies.size,
          location: companies.location,
          phone: companies.phone,
          status: companies.status,
          ownerId: companies.ownerId,
          deletedAt: companies.deletedAt,
          createdAt: companies.createdAt,
          updatedAt: companies.updatedAt,
          ...ownerCols
        })
        .from(companies)
        .leftJoin(users, eq(users.id, companies.ownerId))
        .where(where)
        .orderBy(orderBy, asc(companies.id))
        .limit(limit)
        .offset(offset),
      ctx.tx.select({ total: count() }).from(companies).where(where)
    ]);
    return { rows, total: totalRow?.total ?? 0, page: input.page, pageSize: input.pageSize };
  }),

  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [company] = await ctx.tx
        .select({
          id: companies.id,
          name: companies.name,
          website: companies.website,
          domain: companies.domain,
          industry: companies.industry,
          size: companies.size,
          location: companies.location,
          phone: companies.phone,
          description: companies.description,
          status: companies.status,
          ownerId: companies.ownerId,
          deletedAt: companies.deletedAt,
          createdAt: companies.createdAt,
          updatedAt: companies.updatedAt,
          ...ownerCols
        })
        .from(companies)
        .leftJoin(users, eq(users.id, companies.ownerId))
        .where(eq(companies.id, input.id));
      if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });

      const [companyContacts, tags] = await Promise.all([
        ctx.tx
          .select({
            id: contacts.id,
            firstName: contacts.firstName,
            lastName: contacts.lastName,
            title: contacts.title,
            email: contacts.email,
            isPrimary: contacts.isPrimary
          })
          .from(contacts)
          .where(and(eq(contacts.companyId, company.id), isNull(contacts.deletedAt)))
          .orderBy(desc(contacts.isPrimary), asc(contacts.lastName)),
        entityTags(ctx.tx, "company", company.id)
      ]);
      return { ...company, contacts: companyContacts, tags };
    }),

  /** Fuzzy pre-create check. Warns, never blocks (M2 acceptance criterion 4). */
  duplicates: workspaceProcedure
    .input(
      z.object({
        name: z.string().trim().max(255).optional(),
        website: z.string().trim().max(255).optional(),
        excludeId: z.string().uuid().optional()
      })
    )
    .query(async ({ ctx, input }) => {
      const domain = normalizeDomain(input.website);
      const matchers = [];
      if (input.name) matchers.push(ilike(companies.name, input.name));
      if (domain) matchers.push(eq(companies.domain, domain));
      if (matchers.length === 0) return [];
      return ctx.tx
        .select({ id: companies.id, name: companies.name, domain: companies.domain })
        .from(companies)
        .where(
          and(
            isNull(companies.deletedAt),
            or(...matchers),
            input.excludeId ? ne(companies.id, input.excludeId) : undefined
          )
        )
        .limit(5);
    }),

  create: workspaceProcedure.input(companyInput).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.tx
      .insert(companies)
      .values({
        workspaceId: ctx.workspaceId,
        name: input.name,
        website: input.website ?? null,
        domain: normalizeDomain(input.website),
        industry: input.industry ?? null,
        size: input.size ?? null,
        location: input.location ?? null,
        phone: input.phone ?? null,
        description: input.description ?? null,
        status: input.status ?? "prospect",
        ownerId: input.ownerId ?? ctx.session.user.id
      })
      .returning();
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await writeAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.session.user.id,
      action: "company.created",
      targetType: "company",
      targetId: created.id,
      meta: { name: created.name }
    });
    return created;
  }),

  update: workspaceProcedure
    .input(z.object({ id: z.string().uuid(), patch: companyInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = { ...input.patch };
      if ("website" in input.patch) patch.domain = normalizeDomain(input.patch.website);
      const [updated] = await ctx.tx
        .update(companies)
        .set(patch)
        .where(and(eq(companies.id, input.id), isNull(companies.deletedAt)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "company.updated",
        targetType: "company",
        targetId: updated.id,
        meta: { fields: Object.keys(input.patch) }
      });
      return updated;
    }),

  softDelete: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.tx
        .update(companies)
        .set({ deletedAt: new Date() })
        .where(and(eq(companies.id, input.id), isNull(companies.deletedAt)))
        .returning({ id: companies.id, name: companies.name });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Company not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "company.deleted",
        targetType: "company",
        targetId: deleted.id,
        meta: { name: deleted.name }
      });
      return deleted;
    }),

  restore: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [restored] = await ctx.tx
        .update(companies)
        .set({ deletedAt: null })
        .where(
          and(
            eq(companies.id, input.id),
            isNotNull(companies.deletedAt),
            gte(companies.deletedAt, trashCutoff())
          )
        )
        .returning({ id: companies.id, name: companies.name });
      if (!restored) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Company not found in trash" });
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "company.restored",
        targetType: "company",
        targetId: restored.id,
        meta: { name: restored.name }
      });
      return restored;
    })
});
