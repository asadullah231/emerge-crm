#!/usr/bin/env tsx
/**
 * Fetch a fresh read-only snapshot of the live Zoho Recruit org to JSONL,
 * in the exact layout snapshotSet() expects (same raw record shape the
 * original 14 Aug MCP snapshot captured). Zoho env vars required.
 *
 * Usage: tsx src/bin/fetch-snapshot.ts <out-dir>
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ZohoClient, zohoConfigFromEnv } from "../zoho.js";

const MODULES: Array<{ file: string; module: string }> = [
  { file: "clients.jsonl", module: "Clients" },
  { file: "contacts.jsonl", module: "Contacts" },
  { file: "jobs.jsonl", module: "Job_Openings" },
  { file: "candidates.jsonl", module: "Candidates" },
  { file: "applications.jsonl", module: "Applications" },
  { file: "notes.jsonl", module: "Notes" }
];

async function main() {
  const outDir = process.argv[2];
  if (!outDir) throw new Error("usage: fetch-snapshot <out-dir>");
  mkdirSync(outDir, { recursive: true });

  const client = new ZohoClient(zohoConfigFromEnv(), { minIntervalMs: 350 });
  const manifest: Record<string, unknown> = {
    snapshot_fetched_at: new Date().toISOString(),
    source: "Zoho Recruit live org via REST v2 (read-only, fetch-snapshot.ts)",
    files: {} as Record<string, unknown>
  };

  for (const { file, module } of MODULES) {
    const seen = new Set<string>();
    const lines: string[] = [];
    let page = 1;
    for (;;) {
      const { records, more } = await client.listRecords(module, page);
      for (const r of records) {
        const id = String(r.id);
        if (seen.has(id)) continue; // Zoho can duplicate rows across pages
        seen.add(id);
        lines.push(JSON.stringify(r));
      }
      console.log(`${module} page ${page}: +${records.length} (total ${seen.size})`);
      if (!more) break;
      page++;
    }
    writeFileSync(path.join(outDir, file), lines.join("\n") + (lines.length ? "\n" : ""));
    (manifest.files as Record<string, unknown>)[file] = {
      module,
      lines: lines.length,
      unique_ids: seen.size
    };
  }

  const users = await client.listUsers();
  writeFileSync(
    path.join(outDir, "users.jsonl"),
    users.map((u) => JSON.stringify(u)).join("\n") + (users.length ? "\n" : "")
  );
  (manifest.files as Record<string, unknown>)["users.jsonl"] = {
    module: "users (AllUsers)",
    lines: users.length,
    unique_ids: users.length
  };

  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`snapshot written to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
