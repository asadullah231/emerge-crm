#!/usr/bin/env tsx
/**
 * Emerge migration CLI. Reads DATABASE_URL from env; no other side effects
 * until a real subcommand is given.
 *
 * Usage:
 *   emerge-migrate build-user-map <snapshot-dir> [out.json]
 *   emerge-migrate dry-run <snapshot-dir> --user-map <path>
 *   emerge-migrate import <snapshot-dir> --workspace <uuid> --user-map <path>
 *   emerge-migrate rollback <run-id>
 *   emerge-migrate verify <snapshot-dir> --workspace <uuid>
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { createDb } from "@emerge/db";
import { readJsonlSync, snapshotSet } from "./snapshot.js";
import { buildProposedUserMap, loadUserMap } from "./userMap.js";
import { runImport } from "./run.js";
import { rollbackRun } from "./rollback.js";
import { verifyImport } from "./verify.js";
import { runAttachmentImport } from "./attachments.js";
import { ZohoClient, zohoConfigFromEnv } from "./zoho.js";
import { s3PutterFromEnv } from "./s3.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const cmd = process.argv[2];
  if (!cmd) {
    console.log(
      `emerge-migrate: subcommands = build-user-map | dry-run | import | rollback | verify | attachments`
    );
    process.exit(1);
  }

  if (cmd === "build-user-map") {
    const dir = process.argv[3];
    if (!dir) throw new Error("snapshot dir required");
    const snap = snapshotSet(dir);
    const users = readJsonlSync<Record<string, unknown>>(snap.users);
    const map = buildProposedUserMap(users);
    const out = process.argv[4] ?? path.join(dir, "user-map.json");
    writeFileSync(out, JSON.stringify(map, null, 2));
    console.log(`wrote proposed user map to ${out} (${map.entries.length} identities)`);
    return;
  }

  if (cmd === "dry-run") {
    const dir = process.argv[3];
    const userMapPath = arg("user-map");
    if (!dir || !userMapPath) throw new Error("usage: dry-run <snapshot-dir> --user-map <path>");
    const userMap = loadUserMap(userMapPath);
    const db = createDb();
    try {
      // Dry-run does not need a workspace; pass a nil uuid so RLS tx does not run.
      const result = await runImport({
        db,
        workspaceId: "00000000-0000-0000-0000-000000000000",
        snapshotDir: dir,
        userMap,
        mode: "dry_run"
      });
      const out = arg("out") ?? path.join(dir, "dry-run-report.json");
      writeFileSync(out, JSON.stringify(result, null, 2));
      console.log(`dry-run report -> ${out}`);
      for (const [k, v] of Object.entries(result.stats))
        console.log(
          `  ${k.padEnd(24)} fetched=${v.fetched}\twould-create=${v.created}\tfailed=${v.failed}`
        );
      console.log(`candidates without email: ${result.candidatesWithoutEmail}`);
      console.log(`duplicate company names: ${result.duplicateCompanyNames.length}`);
      if (result.duplicateCompanyNames.length)
        for (const d of result.duplicateCompanyNames) console.log(`  - "${d.name}" x${d.count}`);
      const unmapped = Object.entries(result.unmappedApplicationStatuses);
      console.log(`unmapped application statuses: ${unmapped.length}`);
      for (const [k, n] of unmapped) console.log(`  - "${k}" x${n}`);
    } finally {
      await db.close();
    }
    return;
  }

  if (cmd === "import") {
    const dir = process.argv[3];
    const workspaceId = arg("workspace");
    const userMapPath = arg("user-map");
    if (!dir || !workspaceId || !userMapPath)
      throw new Error("usage: import <snapshot-dir> --workspace <uuid> --user-map <path>");
    const userMap = loadUserMap(userMapPath);
    const db = createDb();
    try {
      const result = await runImport({
        db,
        workspaceId,
        snapshotDir: dir,
        userMap,
        mode: "import"
      });
      console.log(`run id: ${result.runId}`);
      for (const [k, v] of Object.entries(result.stats))
        console.log(
          `  ${k.padEnd(24)} created=${v.created}\tupdated=${v.updated}\tskipped=${v.skipped}\tfailed=${v.failed}`
        );
    } finally {
      await db.close();
    }
    return;
  }

  if (cmd === "rollback") {
    const runId = process.argv[3];
    if (!runId) throw new Error("usage: rollback <run-id>");
    const db = createDb();
    try {
      const r = await rollbackRun({ db, runId });
      console.log(`rolled back ${r.deleted} rows (updates skipped: ${r.skippedUpdates})`);
    } finally {
      await db.close();
    }
    return;
  }

  if (cmd === "verify") {
    const dir = process.argv[3];
    const workspaceId = arg("workspace");
    if (!dir || !workspaceId) throw new Error("usage: verify <snapshot-dir> --workspace <uuid>");
    const db = createDb();
    try {
      const r = await verifyImport({ db, workspaceId, snapshotDir: dir });
      console.log(JSON.stringify(r, null, 2));
    } finally {
      await db.close();
    }
    return;
  }

  if (cmd === "attachments") {
    const dir = process.argv[3];
    const workspaceId = arg("workspace");
    if (!dir || !workspaceId)
      throw new Error(
        "usage: attachments <snapshot-dir> --workspace <uuid> [--module Candidates] [--limit N] [--concurrency N] [--dry-run]"
      );
    const dryRun = process.argv.includes("--dry-run");
    const limit = arg("limit");
    const concurrency = arg("concurrency");
    const zoho = new ZohoClient(zohoConfigFromEnv());
    const s3 = s3PutterFromEnv();
    if (!dryRun && !s3) throw new Error("S3_* env not configured (needed to store files)");
    const db = createDb();
    try {
      const r = await runAttachmentImport({
        db,
        workspaceId,
        snapshotDir: dir,
        zoho,
        s3,
        module: arg("module"),
        limit: limit ? Number(limit) : undefined,
        concurrency: concurrency ? Number(concurrency) : undefined,
        dryRun,
        log: (m) => console.log(m)
      });
      console.log(
        JSON.stringify(
          {
            runId: r.runId,
            flagged: r.flagged,
            unresolved: r.unresolved,
            candidatesProcessed: r.candidatesProcessed,
            listed: r.listed,
            uploaded: r.uploaded,
            skippedExisting: r.skippedExisting,
            skippedTooLarge: r.skippedTooLarge,
            failed: r.failed
          },
          null,
          2
        )
      );
      if (r.errors.length) {
        console.log(`first errors (${r.errors.length} total):`);
        for (const e of r.errors.slice(0, 20)) console.log(`  - ${e}`);
      }
    } finally {
      await db.close();
    }
    return;
  }

  throw new Error(`unknown subcommand ${cmd}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
