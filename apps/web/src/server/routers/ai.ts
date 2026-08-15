import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AI_PROVIDERS, decryptSecret, encryptSecret, last4, verifyAiConfig } from "@emerge/ai";
import { aiProvider, workspaceAiSettings } from "@emerge/db";
import { writeAudit } from "../audit";
import { adminProcedure, router, workspaceProcedure } from "../trpc";

const providerEnum = z.enum(aiProvider.enumValues);

const settingsInput = z.object({
  provider: providerEnum,
  model: z.string().trim().min(1).max(120),
  baseUrl: z.string().trim().url().max(300).nullable().optional(),
  // Omit to keep the stored key; provide to set/replace it.
  apiKey: z.string().trim().min(8).max(400).optional()
});

export const aiRouter = router({
  /** The provider catalogue for the settings dropdown. */
  providers: workspaceProcedure.query(() => AI_PROVIDERS),

  /** Current workspace AI config, without exposing the key (last 4 only). */
  get: workspaceProcedure.query(async ({ ctx }) => {
    const [s] = await ctx.tx
      .select()
      .from(workspaceAiSettings)
      .where(eq(workspaceAiSettings.workspaceId, ctx.workspaceId));
    if (!s) return null;
    return {
      provider: s.provider,
      model: s.model,
      baseUrl: s.baseUrl,
      hasKey: !!s.apiKeyCiphertext,
      keyLast4: s.apiKeyLast4,
      updatedAt: s.updatedAt
    };
  }),

  save: adminProcedure.input(settingsInput).mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.tx
      .select()
      .from(workspaceAiSettings)
      .where(eq(workspaceAiSettings.workspaceId, ctx.workspaceId));

    const keyFields: Record<string, string> = {};
    if (input.apiKey) {
      const enc = encryptSecret(input.apiKey);
      keyFields.apiKeyCiphertext = enc.ciphertext;
      keyFields.apiKeyIv = enc.iv;
      keyFields.apiKeyTag = enc.tag;
      keyFields.apiKeyLast4 = last4(input.apiKey);
    } else if (!existing?.apiKeyCiphertext) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "An API key is required" });
    }

    const values = {
      provider: input.provider,
      model: input.model,
      baseUrl: input.baseUrl ?? null,
      updatedById: ctx.session.user.id,
      updatedAt: new Date(),
      ...keyFields
    };

    if (existing) {
      await ctx.tx
        .update(workspaceAiSettings)
        .set(values)
        .where(eq(workspaceAiSettings.id, existing.id));
    } else {
      await ctx.tx
        .insert(workspaceAiSettings)
        .values({ workspaceId: ctx.workspaceId, ...values });
    }

    await writeAudit({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.session.user.id,
      action: "ai.settings_updated",
      targetType: "workspace",
      targetId: ctx.workspaceId,
      meta: { provider: input.provider, model: input.model, keyChanged: !!input.apiKey }
    });
    return { ok: true };
  }),

  /** Validate a config against the live provider (uses the stored key if none given). */
  test: adminProcedure
    .input(settingsInput)
    .mutation(async ({ ctx, input }): Promise<{ ok: boolean; error?: string }> => {
      let apiKey = input.apiKey;
      if (!apiKey) {
        const [s] = await ctx.tx
          .select()
          .from(workspaceAiSettings)
          .where(eq(workspaceAiSettings.workspaceId, ctx.workspaceId));
        if (s?.apiKeyCiphertext && s.apiKeyIv && s.apiKeyTag) {
          apiKey = decryptSecret({
            ciphertext: s.apiKeyCiphertext,
            iv: s.apiKeyIv,
            tag: s.apiKeyTag
          });
        }
      }
      if (!apiKey) return { ok: false, error: "No API key to test" };
      try {
        await verifyAiConfig({
          provider: input.provider,
          model: input.model,
          apiKey,
          baseUrl: input.baseUrl ?? null
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Connection failed" };
      }
    })
});
