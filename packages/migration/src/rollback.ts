/**
 * Rollback: undo a run by id. For rows with action=created, delete them (and
 * their external_ref) in reverse dependency order so FKs never break.
 * Bulk-DELETEs per entity so the whole run rolls back in seconds even over
 * high-latency links. action=updated rows record a pre-image in
 * import_records.pre_image but pre-image restore is not implemented in this
 * iteration (first-run imports only produce `created` rows, which is what
 * Phase B exercises).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { externalRefs, importRecords, importRuns, type Database } from "@emerge/db";
import { withWorkspace } from "@emerge/db";
import type { EntityType } from "./types.js";

const REVERSE_ORDER: EntityType[] = [
  "note",
  "application",
  "candidate_experience",
  "candidate_education",
  "job",
  "candidate",
  "contact",
  "company"
];

function entityToTable(entity: string): string {
  switch (entity) {
    case "company":
      return "companies";
    case "contact":
      return "contacts";
    case "candidate":
      return "candidates";
    case "candidate_education":
      return "candidate_education";
    case "candidate_experience":
      return "candidate_experience";
    case "job":
      return "jobs";
    case "application":
      return "applications";
    case "note":
      return "notes";
    default:
      throw new Error(`unknown entity ${entity}`);
  }
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function rollbackRun(opts: {
  db: Database;
  runId: string;
}): Promise<{ deleted: number; skippedUpdates: number }> {
  const [run] = await opts.db.select().from(importRuns).where(eq(importRuns.id, opts.runId));
  if (!run) throw new Error(`run ${opts.runId} not found`);
  const workspaceId = run.workspaceId;
  let deleted = 0;
  let skippedUpdates = 0;

  await withWorkspace(opts.db, workspaceId, async (tx) => {
    for (const entity of REVERSE_ORDER) {
      const rows = await tx
        .select({
          externalId: importRecords.externalId,
          internalId: importRecords.internalId,
          action: importRecords.action
        })
        .from(importRecords)
        .where(and(eq(importRecords.runId, opts.runId), eq(importRecords.entityType, entity)));

      const createdIds: string[] = [];
      const createdExternalIds: string[] = [];
      for (const r of rows) {
        if (r.action === "created" && r.internalId) {
          createdIds.push(r.internalId);
          createdExternalIds.push(r.externalId);
        } else if (r.action === "updated") {
          skippedUpdates++;
        }
      }
      if (!createdIds.length) continue;

      const table = entityToTable(entity);
      for (const ids of chunk(createdIds, 500)) {
        // Bulk DELETE by id list. Raw SQL because drizzle's inArray needs the
        // table symbol; we already have the table name string.
        await tx.execute(
          sql.raw(`delete from "${table}" where id in (${ids.map((id) => `'${id}'`).join(", ")})`)
        );
      }
      for (const exts of chunk(createdExternalIds, 500)) {
        await tx
          .delete(externalRefs)
          .where(
            and(
              eq(externalRefs.workspaceId, workspaceId),
              eq(externalRefs.source, "zoho"),
              eq(externalRefs.entityType, entity),
              inArray(externalRefs.externalId, exts)
            )
          );
      }
      deleted += createdIds.length;
    }

    await tx
      .update(importRuns)
      .set({ status: "rolled_back", finishedAt: new Date() })
      .where(eq(importRuns.id, opts.runId));
  });

  return { deleted, skippedUpdates };
}
