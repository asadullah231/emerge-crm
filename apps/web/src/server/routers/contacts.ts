import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, gte, inArray, isNull, isNotNull, ne, or } from "drizzle-orm";
import { z } from "zod";
import { companies, contacts, users, type Transaction } from "@emerge/db";
import { writeAudit } from "../audit";
import { buildListClauses, listInput, trashCutoff } from "../list-query";
import { router, workspaceProcedure } from "../trpc";
import { entityTags, taggedEntityIds } from "./tags";

const contactInput = z.object({
  firstName: z.string().trim().max(125).nullable().optional(),
  lastName: z.string().trim().min(1, "Last name is required").max(125),
  title: z.string().trim().max(120).nullable().optional(),
  email: z
    .string()
    .trim()
    .email()
    .max(255)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  secondaryEmail: z
    .string()
    .trim()
    .email()
    .max(255)
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  workPhone: z.string().trim().max(50).nullable().optional(),
  mobile: z.string().trim().max(50).nullable().optional(),
  linkedinUrl: z.string().trim().max(255).nullable().optional(),
  /** Null = independent contact, explicitly allowed. */
  companyId: z.string().uuid().nullable().optional(),
  isPrimary: z.boolean().optional(),
  ownerId: z.string().uuid().nullable().optional()
});

const baseCols = {
  id: contacts.id,
  firstName: contacts.firstName,
  lastName: contacts.lastName,
  title: contacts.title,
  email: contacts.email,
  secondaryEmail: contacts.secondaryEmail,
  workPhone: contacts.workPhone,
  mobile: contacts.mobile,
  linkedinUrl: contacts.linkedinUrl,
  isPrimary: contacts.isPrimary,
  companyId: contacts.companyId,
  ownerId: contacts.ownerId,
  deletedAt: contacts.deletedAt,
  createdAt: contacts.createdAt,
  updatedAt: contacts.updatedAt,
  companyName: companies.name,
  ownerName: users.name
};

/** Clears the primary flag on every other contact of the company. */
async function demoteOtherPrimaries(tx: Transaction, companyId: string, keepContactId: string) {
  await tx
    .update(contacts)
    .set({ isPrimary: false })
    .where(
      and(
        eq(contacts.companyId, companyId),
        eq(contacts.isPrimary, true),
        ne(contacts.id, keepContactId)
      )
    );
}

export const contactsRouter = router({
  list: workspaceProcedure
    .input(listInput.extend({ isPrimary: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const { orderBy, searchWhere, limit, offset } = buildListClauses(input, {
        sortable: {
          lastName: contacts.lastName,
          firstName: contacts.firstName,
          email: contacts.email,
          title: contacts.title,
          createdAt: contacts.createdAt,
          updatedAt: contacts.updatedAt
        },
        searchable: [contacts.firstName, contacts.lastName, contacts.email, contacts.title],
        defaultSort: "lastName"
      });
      const deletedWhere = input.deleted
        ? and(isNotNull(contacts.deletedAt), gte(contacts.deletedAt, trashCutoff()))
        : isNull(contacts.deletedAt);
      const tagWhere =
        input.tagIds && input.tagIds.length > 0
          ? inArray(contacts.id, taggedEntityIds(ctx.tx, "contact", input.tagIds))
          : undefined;
      const primaryWhere =
        input.isPrimary === undefined ? undefined : eq(contacts.isPrimary, input.isPrimary);
      const where = and(deletedWhere, searchWhere, tagWhere, primaryWhere);

      const [rows, [totalRow]] = await Promise.all([
        ctx.tx
          .select(baseCols)
          .from(contacts)
          .leftJoin(companies, eq(companies.id, contacts.companyId))
          .leftJoin(users, eq(users.id, contacts.ownerId))
          .where(where)
          .orderBy(orderBy, asc(contacts.id))
          .limit(limit)
          .offset(offset),
        ctx.tx.select({ total: count() }).from(contacts).where(where)
      ]);
      return { rows, total: totalRow?.total ?? 0, page: input.page, pageSize: input.pageSize };
    }),

  get: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [contact] = await ctx.tx
        .select(baseCols)
        .from(contacts)
        .leftJoin(companies, eq(companies.id, contacts.companyId))
        .leftJoin(users, eq(users.id, contacts.ownerId))
        .where(eq(contacts.id, input.id));
      if (!contact) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      const tags = await entityTags(ctx.tx, "contact", contact.id);
      return { ...contact, tags };
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
      const email = input.email?.toLowerCase();
      if (!email) return [];
      return ctx.tx
        .select({
          id: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email
        })
        .from(contacts)
        .where(
          and(
            isNull(contacts.deletedAt),
            or(eq(contacts.email, email), eq(contacts.secondaryEmail, email)),
            input.excludeId ? ne(contacts.id, input.excludeId) : undefined
          )
        )
        .limit(5);
    }),

  create: workspaceProcedure.input(contactInput).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.tx
      .insert(contacts)
      .values({
        workspaceId: ctx.workspaceId,
        firstName: input.firstName ?? null,
        lastName: input.lastName,
        title: input.title ?? null,
        email: input.email?.toLowerCase() ?? null,
        secondaryEmail: input.secondaryEmail?.toLowerCase() ?? null,
        workPhone: input.workPhone ?? null,
        mobile: input.mobile ?? null,
        linkedinUrl: input.linkedinUrl ?? null,
        companyId: input.companyId ?? null,
        isPrimary: input.isPrimary ?? false,
        ownerId: input.ownerId ?? ctx.session.user.id
      })
      .returning();
    if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    if (created.isPrimary && created.companyId) {
      await demoteOtherPrimaries(ctx.tx, created.companyId, created.id);
    }
    await writeAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.session.user.id,
      action: "contact.created",
      targetType: "contact",
      targetId: created.id,
      meta: { name: [created.firstName, created.lastName].filter(Boolean).join(" ") }
    });
    return created;
  }),

  update: workspaceProcedure
    .input(z.object({ id: z.string().uuid(), patch: contactInput.partial() }))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = { ...input.patch };
      if (typeof patch.email === "string") patch.email = patch.email.toLowerCase();
      if (typeof patch.secondaryEmail === "string") {
        patch.secondaryEmail = patch.secondaryEmail.toLowerCase();
      }
      const [updated] = await ctx.tx
        .update(contacts)
        .set(patch)
        .where(and(eq(contacts.id, input.id), isNull(contacts.deletedAt)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      if (updated.isPrimary && updated.companyId) {
        await demoteOtherPrimaries(ctx.tx, updated.companyId, updated.id);
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "contact.updated",
        targetType: "contact",
        targetId: updated.id,
        meta: { fields: Object.keys(input.patch) }
      });
      return updated;
    }),

  softDelete: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.tx
        .update(contacts)
        .set({ deletedAt: new Date() })
        .where(and(eq(contacts.id, input.id), isNull(contacts.deletedAt)))
        .returning({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName });
      if (!deleted) throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "contact.deleted",
        targetType: "contact",
        targetId: deleted.id,
        meta: { name: [deleted.firstName, deleted.lastName].filter(Boolean).join(" ") }
      });
      return deleted;
    }),

  restore: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [restored] = await ctx.tx
        .update(contacts)
        .set({ deletedAt: null })
        .where(
          and(
            eq(contacts.id, input.id),
            isNotNull(contacts.deletedAt),
            gte(contacts.deletedAt, trashCutoff())
          )
        )
        .returning({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName });
      if (!restored) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Contact not found in trash" });
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "contact.restored",
        targetType: "contact",
        targetId: restored.id,
        meta: { name: [restored.firstName, restored.lastName].filter(Boolean).join(" ") }
      });
      return restored;
    })
});
