#!/usr/bin/env tsx
/**
 * Diagnostic: import ONLY companies from the snapshot into the given
 * workspace. If this hangs, the RLS transaction path is the bottleneck, not
 * the rest of the entities.
 */
import { createDb } from "@emerge/db";
import { runImport } from "../run.js";
import { loadUserMap } from "../userMap.js";

async function main() {
  const snap = process.argv[2];
  const ws = process.argv[3];
  const map = process.argv[4];
  if (!snap || !ws || !map) throw new Error("usage: smoke-companies <snap> <ws> <user-map>");
  const db = createDb();
  try {
    const started = Date.now();
    const r = await runImport({
      db,
      workspaceId: ws,
      snapshotDir: snap,
      userMap: loadUserMap(map),
      mode: "import",
      only: ["company"]
    });
    console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log("stats.company", r.stats.company);
    console.log("runId", r.runId);
  } finally {
    await db.close();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
