/**
 * Attachment (CV) backfill phase.
 *
 * The offline snapshot import (run.ts) brings in every record's metadata but not
 * its files. This phase pulls the actual attachment bytes from the LIVE Zoho API
 * and stores them where the CRM already serves downloads from:
 *
 *   Zoho record  --(external_refs)-->  Emerge candidate id
 *   Zoho attachment bytes  -->  MinIO (S3)  -->  attachments row (+ external_ref)
 *
 * Idempotent (per-attachment external_ref guard), resumable (re-running skips
 * already-stored files), rate-limit safe (ZohoClient backoff + small pool).
 * Files/downloads happen OUTSIDE the DB transaction; only the row writes are in
 * a short per-candidate workspace RLS tx.
 */
import { and, eq } from "drizzle-orm";
import {
  attachments as attachmentsTable,
  externalRefs,
  importRecords,
  importRuns,
  withWorkspace,
  type Database,
  type Transaction
} from "@emerge/db";

import { readJsonlSync, snapshotSet } from "./snapshot.js";
import { sha256 } from "./transform/util.js";
import type { ZohoAttachment, ZohoClient } from "./zoho.js";
import type { S3Putter } from "./s3.js";

export type AttachmentKind = "cv" | "formatted_cv" | "other";

const DOC_MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  rtf: "application/rtf",
  txt: "text/plain",
  odt: "application/vnd.oasis.opendocument.text",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif"
};
const DOC_EXTS = new Set(["pdf", "doc", "docx", "rtf", "txt", "odt"]);

/** Best-effort MIME from the file extension; octet-stream when unknown. */
export function mimeFromFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return DOC_MIME[ext] ?? "application/octet-stream";
}

/**
 * Classify a candidate attachment. Candidate attachments are overwhelmingly the
 * CV, so a document-type file defaults to `cv`; a "formatted"/"branded" file to
 * `formatted_cv`; anything non-document (image etc.) to `other`.
 */
export function classifyAttachmentKind(att: ZohoAttachment): AttachmentKind {
  const name = att.fileName.toLowerCase();
  const type = (att.type ?? "").toLowerCase();
  if (name.includes("formatted") || type.includes("formatted")) return "formatted_cv";
  const ext = name.split(".").pop() ?? "";
  return DOC_EXTS.has(ext) ? "cv" : "other";
}

/** Filesystem/URL-safe filename, matching the web upload route's sanitisation. */
export function safeFilename(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 200) || "attachment";
}

/**
 * Object key under the workspace-scoped candidate prefix the CRM already uses,
 * with the Zoho attachment id embedded so re-runs are deterministic.
 */
export function objectKeyFor(
  workspaceId: string,
  candidateId: string,
  attachmentId: string,
  filename: string
): string {
  return `workspaces/${workspaceId}/candidates/${candidateId}/zoho-${attachmentId}-${safeFilename(filename)}`;
}

/** Pick the candidates worth listing: flagged Is_Attachment_Present + resolvable. */
export function selectCandidatesWithAttachments(
  rawCandidates: Array<Record<string, unknown>>,
  refMap: Map<string, string>
): { work: Array<{ zohoId: string; internalId: string }>; flagged: number; unresolved: number } {
  const work: Array<{ zohoId: string; internalId: string }> = [];
  let flagged = 0;
  let unresolved = 0;
  for (const r of rawCandidates) {
    if (r.Is_Attachment_Present !== true) continue;
    flagged++;
    const zohoId = String(r.id);
    const internalId = refMap.get(zohoId);
    if (!internalId) {
      unresolved++;
      continue;
    }
    work.push({ zohoId, internalId });
  }
  return { work, flagged, unresolved };
}

/** Run N async tasks with a bounded concurrency pool, in order. */
async function withConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
}

export interface AttachmentRunOptions {
  db: Database;
  workspaceId: string;
  snapshotDir: string;
  zoho: ZohoClient;
  /** Required for a real run; omit only for dryRun. */
  s3?: S3Putter | null;
  /** Zoho module to pull attachments from (default Candidates). */
  module?: string;
  /** Entity type stored on the attachments row (default candidate). */
  entityType?: string;
  limit?: number;
  concurrency?: number;
  /** Skip files larger than this many bytes (default 50 MB). */
  maxBytes?: number;
  dryRun?: boolean;
  log?: (msg: string) => void;
}

export interface AttachmentRunResult {
  runId: string | null;
  flagged: number;
  unresolved: number;
  candidatesProcessed: number;
  listed: number;
  uploaded: number;
  skippedExisting: number;
  skippedTooLarge: number;
  failed: number;
  errors: string[];
}

export async function runAttachmentImport(
  opts: AttachmentRunOptions
): Promise<AttachmentRunResult> {
  const module = opts.module ?? "Candidates";
  const entityType = opts.entityType ?? "candidate";
  const maxBytes = opts.maxBytes ?? 50 * 1024 * 1024;
  const concurrency = opts.concurrency ?? 4;
  const log = opts.log ?? (() => {});
  const isDry = opts.dryRun === true;

  const snap = snapshotSet(opts.snapshotDir);
  const rawCandidates = readJsonlSync<Record<string, unknown>>(snap.candidates);

  // Resolve Zoho candidate id -> Emerge candidate id, and which attachments we
  // already have, both inside one workspace RLS read tx.
  const { refMap, existing } = await withWorkspace(opts.db, opts.workspaceId, async (tx) => {
    const candRefs = await tx
      .select({ externalId: externalRefs.externalId, internalId: externalRefs.internalId })
      .from(externalRefs)
      .where(
        and(
          eq(externalRefs.workspaceId, opts.workspaceId),
          eq(externalRefs.source, "zoho"),
          eq(externalRefs.entityType, entityType)
        )
      );
    const attRefs = await tx
      .select({ externalId: externalRefs.externalId })
      .from(externalRefs)
      .where(
        and(
          eq(externalRefs.workspaceId, opts.workspaceId),
          eq(externalRefs.source, "zoho"),
          eq(externalRefs.entityType, "attachment")
        )
      );
    return {
      refMap: new Map(candRefs.map((r) => [r.externalId, r.internalId])),
      existing: new Set(attRefs.map((r) => r.externalId))
    };
  });

  const selected = selectCandidatesWithAttachments(rawCandidates, refMap);
  let work = selected.work;
  if (opts.limit != null) work = work.slice(0, opts.limit);
  log(
    `attachments: ${selected.flagged} flagged, ${selected.unresolved} unresolved, ` +
      `${work.length} to process (already stored: ${existing.size})`
  );

  const result: AttachmentRunResult = {
    runId: null,
    flagged: selected.flagged,
    unresolved: selected.unresolved,
    candidatesProcessed: 0,
    listed: 0,
    uploaded: 0,
    skippedExisting: 0,
    skippedTooLarge: 0,
    failed: 0,
    errors: []
  };

  if (isDry) {
    // Dry-run still lists (verifies connectivity + counts) but never downloads,
    // uploads, or writes to the DB.
    await withConcurrency(work, concurrency, async (cand) => {
      try {
        const atts = await opts.zoho.listAttachments(module, cand.zohoId);
        result.listed += atts.length;
        result.skippedExisting += atts.filter((a) => existing.has(a.id)).length;
      } catch (e) {
        result.failed++;
        result.errors.push(`list ${cand.zohoId}: ${errMsg(e)}`);
      }
      result.candidatesProcessed++;
    });
    return result;
  }

  if (!opts.s3) throw new Error("s3 putter required for a non-dry-run attachment import");
  const s3 = opts.s3;

  result.runId = await createAttachmentRun(opts.db, opts.workspaceId, opts.snapshotDir);
  const seen = new Set(existing);

  await withConcurrency(work, concurrency, async (cand) => {
    try {
      const atts = await opts.zoho.listAttachments(module, cand.zohoId);
      result.listed += atts.length;
      const rows: Array<{
        att: ZohoAttachment;
        kind: AttachmentKind;
        key: string;
        mime: string;
        size: number;
        bucket: string;
      }> = [];
      for (const att of atts) {
        if (seen.has(att.id)) {
          result.skippedExisting++;
          continue;
        }
        if (att.size > maxBytes) {
          result.skippedTooLarge++;
          result.errors.push(`skip ${att.id} (${att.fileName}): ${att.size} bytes > max`);
          continue;
        }
        const { bytes, contentType } = await opts.zoho.downloadAttachment(
          module,
          cand.zohoId,
          att.id
        );
        const key = objectKeyFor(opts.workspaceId, cand.internalId, att.id, att.fileName);
        const mime = mimeFromFilename(att.fileName) || contentType || "application/octet-stream";
        const bucket = await s3.put(key, bytes, mime);
        rows.push({
          att,
          kind: classifyAttachmentKind(att),
          key,
          mime,
          size: bytes.length,
          bucket
        });
      }
      if (rows.length) {
        await withWorkspace(opts.db, opts.workspaceId, (tx) =>
          insertAttachmentRows(tx, {
            workspaceId: opts.workspaceId,
            runId: result.runId!,
            entityType,
            entityId: cand.internalId,
            rows
          })
        );
        for (const r of rows) seen.add(r.att.id);
        result.uploaded += rows.length;
      }
    } catch (e) {
      result.failed++;
      result.errors.push(`candidate ${cand.zohoId}: ${errMsg(e)}`);
    }
    result.candidatesProcessed++;
    if (result.candidatesProcessed % 100 === 0)
      log(`  …${result.candidatesProcessed}/${work.length} processed, ${result.uploaded} uploaded`);
  });

  await finishAttachmentRun(opts.db, opts.workspaceId, result);
  return result;
}

async function insertAttachmentRows(
  tx: Transaction,
  args: {
    workspaceId: string;
    runId: string;
    entityType: string;
    entityId: string;
    rows: Array<{
      att: ZohoAttachment;
      kind: AttachmentKind;
      key: string;
      mime: string;
      size: number;
      bucket: string;
    }>;
  }
) {
  for (const r of args.rows) {
    const [row] = await tx
      .insert(attachmentsTable)
      .values({
        workspaceId: args.workspaceId,
        entityType: args.entityType,
        entityId: args.entityId,
        kind: r.kind,
        bucket: r.bucket,
        objectKey: r.key,
        filename: safeFilename(r.att.fileName),
        mime: r.mime,
        size: r.size,
        uploadedById: null
      })
      .returning({ id: attachmentsTable.id });
    if (!row) continue;
    await tx
      .insert(externalRefs)
      .values({
        workspaceId: args.workspaceId,
        source: "zoho",
        entityType: "attachment",
        externalId: r.att.id,
        internalId: row.id,
        updatedAt: new Date()
      })
      .onConflictDoNothing({
        target: [
          externalRefs.workspaceId,
          externalRefs.source,
          externalRefs.entityType,
          externalRefs.externalId
        ]
      });
    await tx.insert(importRecords).values({
      workspaceId: args.workspaceId,
      runId: args.runId,
      entityType: "attachment",
      externalId: r.att.id,
      action: "created",
      internalId: row.id,
      payloadHash: sha256({ id: r.att.id, size: r.size, filename: r.att.fileName })
    });
  }
}

async function createAttachmentRun(
  db: Database,
  workspaceId: string,
  snapshotDir: string
): Promise<string> {
  const [row] = await withWorkspace(db, workspaceId, (tx) =>
    tx
      .insert(importRuns)
      .values({ workspaceId, mode: "import", scope: "attachments", snapshotDir })
      .returning({ id: importRuns.id })
  );
  if (!row) throw new Error("failed to create import_runs row");
  return row.id;
}

async function finishAttachmentRun(db: Database, workspaceId: string, result: AttachmentRunResult) {
  if (!result.runId) return;
  const runId = result.runId;
  await withWorkspace(db, workspaceId, async (tx) => {
    await tx
      .update(importRuns)
      .set({
        status: "completed",
        finishedAt: new Date(),
        stats: {
          attachment: {
            fetched: result.listed,
            created: result.uploaded,
            updated: 0,
            linked: 0,
            skipped: result.skippedExisting + result.skippedTooLarge,
            failed: result.failed
          }
        }
      })
      .where(eq(importRuns.id, runId));
  });
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
