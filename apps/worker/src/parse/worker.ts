/**
 * The parse worker: consumes the "parse" queue (jobs enqueued by the web app on
 * CV upload), reads the file from S3, extracts + parses it with Claude, and
 * writes the structured result back onto the parse_jobs row. Failures set
 * status=failed with the message so the CV lands in the review/triage list.
 *
 * All DB writes go through a workspace RLS transaction, same as the app.
 */
import { Worker } from "bullmq";
import type IORedis from "ioredis";
import { and, eq } from "drizzle-orm";
import { createDb, parseJobs, withWorkspace } from "@emerge/db";
import { extractForParse } from "./extract.js";
import { parseResume } from "./claude.js";
import { getObjectBytes } from "./s3.js";

export type ParseJobData = { parseJobId: string; workspaceId: string };

export function startParseWorker(connection: IORedis): Worker<ParseJobData> {
  const db = createDb();

  const worker = new Worker<ParseJobData>(
    "parse",
    async (job) => {
      const { parseJobId, workspaceId } = job.data;

      // Claim the job (queued -> parsing); if it isn't queued, load current state.
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
      // Already handled (retry of a done job): nothing to do.
      if (row.status === "confirmed" || row.status === "discarded") return;

      try {
        const bytes = await getObjectBytes(row.bucket, row.objectKey);
        const extracted = await extractForParse(bytes, row.mime, row.filename);
        const parsed = await parseResume(extracted);
        const rawText = extracted.mode === "text" ? extracted.text.slice(0, 200_000) : null;
        await withWorkspace(db, workspaceId, (tx) =>
          tx
            .update(parseJobs)
            .set({ status: "parsed", parsed, rawText, error: null, updatedAt: new Date() })
            .where(eq(parseJobs.id, parseJobId))
        );
        console.log(`[worker] parsed CV ${row.filename} (job ${parseJobId})`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await withWorkspace(db, workspaceId, (tx) =>
          tx
            .update(parseJobs)
            .set({ status: "failed", error: message.slice(0, 1000), updatedAt: new Date() })
            .where(eq(parseJobs.id, parseJobId))
        );
        throw err; // surface to BullMQ for retry/backoff
      }
    },
    { connection, concurrency: 3 }
  );

  worker.on("failed", (job, err) => {
    console.error(`[worker] parse job ${job?.id ?? "unknown"} failed:`, err.message);
  });
  return worker;
}
