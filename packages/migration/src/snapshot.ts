/**
 * Read-only helpers for the raw Zoho JSONL snapshots on disk. Each snapshot
 * file is one JSON record per line, exactly as returned by the Zoho API.
 * The engine only reads snapshots; it never writes them (snapshotting is done
 * by a separate step so the two concerns stay decoupled).
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";

export interface SnapshotSet {
  dir: string;
  users: string;
  clients: string;
  contacts: string;
  candidates: string;
  jobs: string;
  applications: string;
  notes: string;
  manifest: string;
}

export function snapshotSet(dir: string): SnapshotSet {
  return {
    dir,
    users: path.join(dir, "users.jsonl"),
    clients: path.join(dir, "clients.jsonl"),
    contacts: path.join(dir, "contacts.jsonl"),
    candidates: path.join(dir, "candidates.jsonl"),
    jobs: path.join(dir, "jobs.jsonl"),
    applications: path.join(dir, "applications.jsonl"),
    notes: path.join(dir, "notes.jsonl"),
    manifest: path.join(dir, "manifest.json")
  };
}

export async function* readJsonl<T = unknown>(file: string): AsyncIterable<T> {
  if (!existsSync(file)) return;
  const rl = createInterface({ input: createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    yield JSON.parse(t) as T;
  }
}

export function readJsonlSync<T = unknown>(file: string): T[] {
  if (!existsSync(file)) return [];
  const raw = readFileSync(file, "utf8");
  const out: T[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    out.push(JSON.parse(line) as T);
  }
  return out;
}

export function fileSummary(file: string): { path: string; exists: boolean; bytes: number } {
  if (!existsSync(file)) return { path: file, exists: false, bytes: 0 };
  return { path: file, exists: true, bytes: statSync(file).size };
}
