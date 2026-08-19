import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { apiKeys } from "@emerge/db";
import { API_SCOPES, generateApiKey } from "../api-keys";
import { writeAudit } from "../audit";
import { adminProcedure, router } from "../trpc";

/**
 * Public REST API keys (M19). Admin-only: list, create (plaintext returned
 * exactly once) and revoke. Revoked keys stay listed for the audit trail.
 */
export const apiKeysRouter = router({
  scopes: adminProcedure.query(() => [...API_SCOPES]),

  list: adminProcedure.query(async ({ ctx }) => {
    return ctx.tx
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        prefix: apiKeys.prefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        revokedAt: apiKeys.revokedAt,
        createdAt: apiKeys.createdAt
      })
      .from(apiKeys)
      .orderBy(desc(apiKeys.createdAt));
  }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().trim().min(1).max(120),
        scopes: z.array(z.enum(API_SCOPES)).min(1)
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { key, prefix, hash } = generateApiKey();
      const [created] = await ctx.tx
        .insert(apiKeys)
        .values({
          workspaceId: ctx.workspaceId,
          name: input.name,
          prefix,
          keyHash: hash,
          scopes: input.scopes,
          createdById: ctx.session.user.id
        })
        .returning({ id: apiKeys.id });
      if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "api_key.created",
        targetType: "workspace",
        targetId: ctx.workspaceId,
        meta: { name: input.name, prefix, scopes: input.scopes }
      });
      // The one and only time the plaintext leaves the server.
      return { id: created.id, key };
    }),

  revoke: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [revoked] = await ctx.tx
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(apiKeys.id, input.id))
        .returning({ id: apiKeys.id, prefix: apiKeys.prefix });
      if (!revoked) throw new TRPCError({ code: "NOT_FOUND", message: "API key not found" });
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "api_key.revoked",
        targetType: "workspace",
        targetId: ctx.workspaceId,
        meta: { prefix: revoked.prefix }
      });
      return revoked;
    })
});
