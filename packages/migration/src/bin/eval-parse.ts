/**
 * Eval harness: create parse_jobs for a sample of existing candidate CV
 * attachments and enqueue them, so the parser can be evaluated on the real CV
 * corpus without the upload UI. Env: SEED_WS, [EVAL_LIMIT=5], REDIS_URL.
 */
import { and, eq, isNull } from "drizzle-orm";
import { Queue } from "bullmq";
import { attachments, createDb, parseJobs, withWorkspace } from "@emerge/db";

function need(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`${key} required`);
  return v;
}

async function main() {
  const ws = need("SEED_WS");
  const limit = Number(process.env.EVAL_LIMIT ?? "5");
  const db = createDb();
  const queue = new Queue("parse", { connection: { url: need("REDIS_URL") } });
  try {
    const ids = await withWorkspace(db, ws, async (tx) => {
      const cvs = await tx
        .select({
          bucket: attachments.bucket,
          objectKey: attachments.objectKey,
          filename: attachments.filename,
          mime: attachments.mime,
          size: attachments.size
        })
        .from(attachments)
        .where(
          and(
            eq(attachments.entityType, "candidate"),
            eq(attachments.kind, "cv"),
            isNull(attachments.deletedAt)
          )
        )
        .limit(limit);
      const out: string[] = [];
      for (const cv of cvs) {
        const [row] = await tx
          .insert(parseJobs)
          .values({
            workspaceId: ws,
            status: "queued",
            bucket: cv.bucket,
            objectKey: cv.objectKey,
            filename: cv.filename,
            mime: cv.mime || "application/pdf",
            size: cv.size,
            sha256: "eval"
          })
          .returning({ id: parseJobs.id });
        if (row) out.push(row.id);
      }
      return out;
    });
    for (const id of ids) await queue.add("parse", { parseJobId: id, workspaceId: ws });
    console.log(`enqueued ${ids.length} eval parse jobs`);
  } finally {
    await queue.close();
    await db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
