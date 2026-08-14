/**
 * Bulk-insert helper: takes a list of pre-transformed rows and writes them in
 * chunked multi-value INSERT statements. Cuts VPS round-trips from N per row
 * (~5 × 342 ms = 1.7 s each) to 3 per chunk of 200 (~1 s per 200 rows =
 * ~5 ms per row). This is why staging import completes in minutes, not hours.
 *
 * Row uuids are generated in Node (uuidv7) so we never need `returning id`.
 * `external_refs` and `import_records` writes are batched alongside the main
 * table write. Update-path (record already imported) still falls back to the
 * per-row path in run.ts.
 */
import { sql, and, eq } from "drizzle-orm";
import { externalRefs, importRecords, type Transaction } from "@emerge/db";
import { uuidv7 } from "uuidv7";
import type { EntityType } from "./types.js";

export interface BulkRow<TShape = unknown> {
  externalId: string;
  shape: TShape;
  hash: string;
}

/** Chunk an array into batches of `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Bulk-import a batch of rows into a single target table. Returns the
 * generated internal ids in the same order as the input rows.
 *
 * The main-table insert uses a raw multi-value VALUES statement so we can
 * skip drizzle's per-row overhead. The row values come from `shapeToRow`
 * which returns { columns, valuesRow }. Callers own the columns list.
 */
export async function bulkInsert<TShape>(
  tx: Transaction,
  opts: {
    tableName: string;
    workspaceId: string;
    runId: string;
    entityType: EntityType;
    rows: BulkRow<TShape>[];
    /** Returns [columnNames[], (row) => unknown[]] for the shape's non-id columns. */
    shapeToColumns: (row: BulkRow<TShape>, internalId: string) => Record<string, unknown>;
    /** Additional columns that must be attached to every row (e.g. human_id). */
    extraPerRow?: (
      row: BulkRow<TShape>,
      index: number,
      internalId: string
    ) => Record<string, unknown>;
    chunkSize?: number;
    refCache: Map<string, string>;
  }
): Promise<Array<{ externalId: string; internalId: string }>> {
  const chunkSize = opts.chunkSize ?? 200;
  const results: Array<{ externalId: string; internalId: string }> = [];
  const now = new Date();

  let globalIndex = 0;
  for (const c of chunk(opts.rows, chunkSize)) {
    // Assign ids
    const assigned = c.map((r, i) => {
      const internalId = uuidv7();
      const base = opts.shapeToColumns(r, internalId);
      const extra = opts.extraPerRow ? opts.extraPerRow(r, globalIndex + i, internalId) : {};
      return {
        externalId: r.externalId,
        internalId,
        hash: r.hash,
        row: { id: internalId, ...base, ...extra }
      };
    });

    // 1) main table bulk insert
    const first = assigned[0]!;
    const cols = Object.keys(first.row);
    const colList = cols.map((c) => `"${c}"`).join(", ");
    const valuesSql = assigned
      .map(
        (a) =>
          "(" +
          cols
            .map((k) => (a.row as Record<string, unknown>)[k])
            .map(literalOrNull)
            .join(", ") +
          ")"
      )
      .join(", ");
    await tx.execute(sql.raw(`insert into "${opts.tableName}" (${colList}) values ${valuesSql}`));

    // 2) external_refs bulk upsert
    await tx
      .insert(externalRefs)
      .values(
        assigned.map((a) => ({
          workspaceId: opts.workspaceId,
          source: "zoho",
          entityType: opts.entityType,
          externalId: a.externalId,
          internalId: a.internalId,
          updatedAt: now
        }))
      )
      .onConflictDoUpdate({
        target: [
          externalRefs.workspaceId,
          externalRefs.source,
          externalRefs.entityType,
          externalRefs.externalId
        ],
        set: { internalId: sql`excluded.internal_id`, updatedAt: now }
      });

    // 3) import_records bulk insert
    await tx.insert(importRecords).values(
      assigned.map((a) => ({
        workspaceId: opts.workspaceId,
        runId: opts.runId,
        entityType: opts.entityType,
        externalId: a.externalId,
        action: "created" as const,
        internalId: a.internalId,
        payloadHash: a.hash
      }))
    );

    for (const a of assigned) {
      opts.refCache.set(`${opts.entityType}:${a.externalId}`, a.internalId);
      results.push({ externalId: a.externalId, internalId: a.internalId });
    }
    globalIndex += c.length;
  }
  return results;
}

/**
 * Preload the set of already-imported externalIds for an entity into a Set,
 * so bulk paths can skip re-inserts cheaply.
 */
export async function existingExternalIds(
  tx: Transaction,
  workspaceId: string,
  entityType: EntityType
): Promise<Set<string>> {
  const rows = await tx
    .select({ externalId: externalRefs.externalId })
    .from(externalRefs)
    .where(
      and(
        eq(externalRefs.workspaceId, workspaceId),
        eq(externalRefs.source, "zoho"),
        eq(externalRefs.entityType, entityType)
      )
    );
  return new Set(rows.map((r) => r.externalId));
}

/** SQL literal encoder for the raw bulk-values statement. */
function literalOrNull(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "object") {
    // jsonb - stringify + cast
    return `'${escape(JSON.stringify(v))}'::jsonb`;
  }
  return `'${escape(String(v))}'`;
}

function escape(s: string): string {
  return s.replace(/'/g, "''");
}
