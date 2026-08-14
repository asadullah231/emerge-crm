/**
 * User mapping table: many Zoho user ids -> one Emerge user handle.
 * The dry-run generates a proposed table from the users snapshot; the file is
 * human-reviewed and re-loaded before every real import. Never auto-created.
 */
import { readFileSync } from "node:fs";

export interface UserMapEntry {
  /** Deterministic Emerge user handle (lowercased email or a chosen slug). */
  handle: string;
  /** Preferred display name. */
  displayName: string;
  /** Preferred email (canonical for this identity). */
  email: string;
  /** All Zoho user ids that resolve to this identity. */
  zohoUserIds: string[];
  /** true = create as active/invitable; false = deactivated member (owner FKs only). */
  active: boolean;
  /** Notes surfaced in the verification report. */
  note?: string;
}

export interface UserMapFile {
  generatedAt: string;
  fallbackHandle: string;
  entries: UserMapEntry[];
}

/** Index a UserMapFile by Zoho user id for O(1) lookups during import. */
export function indexUserMap(file: UserMapFile): Map<string, UserMapEntry> {
  const idx = new Map<string, UserMapEntry>();
  for (const e of file.entries) {
    for (const zid of e.zohoUserIds) idx.set(zid, e);
  }
  return idx;
}

export function loadUserMap(path: string): UserMapFile {
  return JSON.parse(readFileSync(path, "utf8")) as UserMapFile;
}

/**
 * Build a proposed user map from the raw users snapshot. Rules:
 *  - Group by canonical email (lowercased). Multiple Zoho records with the
 *    same email collapse to one Emerge identity (deleted + re-created).
 *  - active = at least one record is status "active".
 *  - fallback owner = the workspace admin (looked up at import time).
 */
export function buildProposedUserMap(rawUsers: Array<Record<string, unknown>>): UserMapFile {
  const byKey = new Map<string, UserMapEntry>();
  for (const u of rawUsers) {
    const email = String(u.email ?? "")
      .trim()
      .toLowerCase();
    const id = String(u.id ?? "");
    if (!id) continue;
    const status = String(u.status ?? "").toLowerCase();
    const displayName = String(u.full_name ?? u.name ?? email ?? id);
    const key = email || `id:${id}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.zohoUserIds.push(id);
      if (status === "active") existing.active = true;
      // prefer the active record's name if it comes later
      if (status === "active") existing.displayName = displayName;
    } else {
      byKey.set(key, {
        handle: email || `zoho:${id}`,
        displayName,
        email: email || "",
        zohoUserIds: [id],
        active: status === "active"
      });
    }
  }
  const entries = Array.from(byKey.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  );
  return {
    generatedAt: new Date().toISOString(),
    fallbackHandle: "admin",
    entries
  };
}
