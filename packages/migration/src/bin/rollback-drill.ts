#!/usr/bin/env tsx
/**
 * Rollback drill for Phase B: for the given workspace, take the most recent
 * completed import run and roll it back, then print counts before + after.
 */
import { desc, eq, and, sql } from "drizzle-orm";
import { createDb, importRuns, externalRefs, withWorkspace } from "@emerge/db";
import { rollbackRun } from "../rollback.js";

async function refCounts(db: ReturnType<typeof createDb>, ws: string) {
  return withWorkspace(db, ws, async (tx) => {
    const rows = await tx
      .select({ entity: externalRefs.entityType, n: sql<number>`count(*)::int` })
      .from(externalRefs)
      .where(and(eq(externalRefs.workspaceId, ws), eq(externalRefs.source, "zoho")))
      .groupBy(externalRefs.entityType)
      .orderBy(externalRefs.entityType);
    return rows;
  });
}

async function main() {
  const ws = process.argv[2];
  if (!ws) throw new Error("usage: rollback-drill <workspace-id>");
  const db = createDb();
  try {
    const [latest] = await db
      .select()
      .from(importRuns)
      .where(and(eq(importRuns.workspaceId, ws), eq(importRuns.status, "completed")))
      .orderBy(desc(importRuns.startedAt))
      .limit(1);
    if (!latest) throw new Error("no completed run to roll back");
    console.log(`rolling back run ${latest.id}`);
    console.log("before:");
    for (const r of await refCounts(db, ws)) console.log(`  ${r.entity.padEnd(24)} ${r.n}`);
    const r = await rollbackRun({ db, runId: latest.id });
    console.log(`\nrolled back ${r.deleted} rows (updates skipped: ${r.skippedUpdates})`);
    console.log("\nafter:");
    for (const row of await refCounts(db, ws)) console.log(`  ${row.entity.padEnd(24)} ${row.n}`);
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
