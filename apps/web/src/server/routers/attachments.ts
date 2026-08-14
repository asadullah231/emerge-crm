import { TRPCError } from "@trpc/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { attachments } from "@emerge/db";
import { writeAudit } from "../audit";
import { deleteObject, getPresignedDownloadUrl, isStorageConfigured } from "../storage";
import { router, workspaceProcedure } from "../trpc";

export const attachmentsRouter = router({
  /** Short-lived presigned URL the client opens to download the file. */
  downloadUrl: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [file] = await ctx.tx
        .select()
        .from(attachments)
        .where(and(eq(attachments.id, input.id), isNull(attachments.deletedAt)));
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
      if (!isStorageConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Storage is not configured" });
      }
      const url = await getPresignedDownloadUrl(file.objectKey, file.filename);
      return { url };
    }),

  remove: workspaceProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [file] = await ctx.tx
        .update(attachments)
        .set({ deletedAt: new Date() })
        .where(and(eq(attachments.id, input.id), isNull(attachments.deletedAt)))
        .returning();
      if (!file) throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
      // Best-effort object removal; the row is already soft-deleted either way.
      if (isStorageConfigured()) {
        try {
          await deleteObject(file.objectKey);
        } catch {
          // Leave the orphaned object; a storage sweep can reclaim it later.
        }
      }
      await writeAudit({
        workspaceId: ctx.workspaceId,
        actorUserId: ctx.session.user.id,
        action: "attachment.deleted",
        targetType: file.entityType,
        targetId: file.entityId,
        meta: { filename: file.filename }
      });
      return { id: file.id };
    })
});
