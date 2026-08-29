/**
 * The parse worker: consumes the "parse" queue, reads the CV from S3, and parses
 * it with the *workspace's own* AI provider (loaded from workspace_ai_settings,
 * key decrypted at use). Result is written back to the parse_jobs row; failures
 * set status=failed with the message so the CV lands in the review/triage list.
 */
import { Worker } from "bullmq";
import type IORedis from "ioredis";
import { and, eq } from "drizzle-orm";
import { createDb, parseJobs, withWorkspace, workspaceAiSettings } from "@emerge/db";
import { decryptSecret, parseResume, type AiConfig } from "@emerge/ai";
import { tryAutoConfirm } from "./auto-confirm.js";
import { getObjectBytes } from "./s3.js";

export type ParseJobData = { parseJobId: string; workspaceId: string };

export function startParseWorker(connection: IORedis): Worker<ParseJobData> {
  const db = createDb();

  const worker = new Worker<ParseJobData>(
    "parse",
    async (job) => {
      const { parseJobId, workspaceId } = job.data;

      const row = await withWorkspace(db, workspaceId, async (tx) => {
        const [claimed] = await tx
          .update(parseJobs)
          .set({ status: "parsing", updatedAt: new Date() })
          .where(and(eq(parseJobs.id, parseJobId), eq(parseJobs.status, "queued")))
          .returning();
        if (claimed) return claimed;
        const [current] = await tx.select().from(parseJobs).where(eq(parseJobs.id, parseJobId));
        return current ?? null;
      });
      if (!row) throw new Error(`parse job ${parseJobId} not found`);
      if (row.status === "confirmed" || row.status === "discarded") return;

      try {
        const cfg = await loadAiConfig(db, workspaceId);
        const bytes = await getObjectBytes(row.bucket, row.objectKey);
        const parsed = await parseResume(cfg, {
          buffer: bytes,
          mime: row.mime,
          filename: row.filename
        });
        await withWorkspace(db, workspaceId, (tx) =>
          tx
            .update(parseJobs)
            .set({ status: "parsed", parsed, error: null, updatedAt: new Date() })
            .where(eq(parseJobs.id, parseJobId))
        );
        console.log(`[worker] parsed CV ${row.filename} (job ${parseJobId})`);

        // One-shot mode (UP-01): create the candidate immediately. Any failure
        // here leaves the row in status=parsed, i.e. the normal review list.
        if (row.autoConfirm) {
          try {
            const result = await tryAutoConfirm(db, workspaceId, parseJobId);
            if (result.outcome === "confirmed") {
              console.log(`[worker] auto-created candidate for ${row.filename}`);
            } else {
              console.log(`[worker] left ${row.filename} for review: ${result.reason}`);
            }
          } catch (err) {
            console.error(`[worker] auto-confirm failed for ${parseJobId}:`, err);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await withWorkspace(db, workspaceId, (tx) =>
          tx
            .update(parseJobs)
            .set({ status: "failed", error: message.slice(0, 1000), updatedAt: new Date() })
            .where(eq(parseJobs.id, parseJobId))
        );
        throw err;
      }
    },
    { connection, concurrency: 3 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] parse job ${job?.id ?? "unknown"} failed:`, err.message);
  });
  return worker;
}

async function loadAiConfig(
  db: ReturnType<typeof createDb>,
  workspaceId: string
): Promise<AiConfig> {
  const cfg = await withWorkspace(db, workspaceId, async (tx) => {
    const [s] = await tx
      .select()
      .from(workspaceAiSettings)
      .where(eq(workspaceAiSettings.workspaceId, workspaceId));
    if (!s || !s.apiKeyCiphertext || !s.apiKeyIv || !s.apiKeyTag) return null;
    const apiKey = decryptSecret({
      ciphertext: s.apiKeyCiphertext,
      iv: s.apiKeyIv,
      tag: s.apiKeyTag
    });
    return { provider: s.provider, model: s.model, apiKey, baseUrl: s.baseUrl } satisfies AiConfig;
  });
  if (!cfg) {
    throw new Error("No AI provider configured for this workspace. Add one in Settings > AI.");
  }
  return cfg;
}
