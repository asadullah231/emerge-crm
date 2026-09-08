#!/usr/bin/env tsx
/**
 * Backfill record owners from a Zoho snapshot after an import. The import
 * engine does not resolve owners (userIdx is unused there), so this maps
 * Candidate_Owner / Account_Manager through the reviewed user map onto
 * workspace members and sets owner_id where it is still null. Records whose
 * Zoho owner has no Emerge account fall back to --default-email when given.
 *
 * Usage: tsx src/bin/fix-owners.ts <snapshot-dir> --workspace <uuid>
 *          --user-map <path> [--default-email <email>]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const TARGETS: Array<{ file: string; table: "candidates" | "jobs"; ownerField: string }> = [
  { file: "candidates.jsonl", table: "candidates", ownerField: "Candidate_Owner" },
  { file: "jobs.jsonl", table: "jobs", ownerField: "Account_Manager" }
];

async function main() {
  const dir = process.argv[2];
  const ws = arg("workspace");
  const userMapPath = arg("user-map");
  const defaultEmail = arg("default-email")?.toLowerCase();
  if (!dir || !ws || !userMapPath)
    throw new Error("usage: fix-owners <snapshot-dir> --workspace <uuid> --user-map <path>");

  const sql = postgres(process.env.DATABASE_URL!);
  const um = JSON.parse(readFileSync(userMapPath, "utf8")) as {
    entries: Array<{ email: string; zohoUserIds: string[] }>;
  };
  const zohoToEmail = new Map<string, string>();
  for (const e of um.entries)
    for (const zid of e.zohoUserIds) zohoToEmail.set(zid, e.email.toLowerCase());

  const members = await sql`
    select u.id, lower(u.email) email from users u
    join memberships m on m.user_id = u.id and m.workspace_id = ${ws}`;
  const emailToUser = new Map(members.map((r) => [r.email as string, r.id as string]));
  const fallbackId = defaultEmail ? emailToUser.get(defaultEmail) : undefined;
  if (defaultEmail && !fallbackId) throw new Error(`default-email ${defaultEmail} not a member`);

  for (const t of TARGETS) {
    const entityType = t.table === "candidates" ? "candidate" : "job";
    let set = 0;
    let fell = 0;
    let unmapped = 0;
    const lines = readFileSync(path.join(dir, t.file), "utf8").trim().split("\n");
    for (const line of lines) {
      const r = JSON.parse(line) as Record<string, { id?: unknown } | null>;
      const zOwner = r[t.ownerField]?.id ? String(r[t.ownerField]!.id) : null;
      const email = zOwner ? zohoToEmail.get(zOwner) : undefined;
      const userId = (email ? emailToUser.get(email) : undefined) ?? fallbackId;
      if (!userId) {
        unmapped++;
        continue;
      }
      const isFallback = !(email && emailToUser.get(email));
      const res = await sql`
        update ${sql(t.table)} rec set owner_id = ${userId}
        from external_refs x
        where x.workspace_id = ${ws} and x.source = 'zoho' and x.entity_type = ${entityType}
          and x.external_id = ${String((r as { id?: unknown }).id)} and rec.id = x.internal_id
          and rec.workspace_id = ${ws} and rec.owner_id is null`;
      if (res.count > 0) isFallback ? fell++ : set++;
    }
    console.log(`${t.table}: set=${set} fallback=${fell} unmapped-no-fallback=${unmapped}`);
  }
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
