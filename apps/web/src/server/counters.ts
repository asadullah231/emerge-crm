import { sql } from "drizzle-orm";
import { counters, type Transaction } from "@emerge/db";

/**
 * Allocates the next value of a per-workspace counter atomically. The
 * upsert-returning runs as a single statement, so concurrent allocations never
 * hand out the same number. Runs inside the caller's RLS transaction, so
 * workspace_id must match the active workspace context.
 */
export async function nextCounter(
  tx: Transaction,
  workspaceId: string,
  entityType: string
): Promise<number> {
  const [row] = await tx
    .insert(counters)
    .values({ workspaceId, entityType, value: 1 })
    .onConflictDoUpdate({
      target: [counters.workspaceId, counters.entityType],
      set: { value: sql`${counters.value} + 1` }
    })
    .returning({ value: counters.value });
  if (!row) throw new Error("counter allocation failed");
  return row.value;
}

/**
 * Reserves a block of `count` counter values in one statement and returns the
 * highest allocated value. The reserved range is
 * [returned - count + 1, returned]. Used for bulk imports.
 */
export async function bumpCounter(
  tx: Transaction,
  workspaceId: string,
  entityType: string,
  count: number
): Promise<number> {
  if (count <= 0) throw new Error("count must be positive");
  const [row] = await tx
    .insert(counters)
    .values({ workspaceId, entityType, value: count })
    .onConflictDoUpdate({
      target: [counters.workspaceId, counters.entityType],
      set: { value: sql`${counters.value} + ${count}` }
    })
    .returning({ value: counters.value });
  if (!row) throw new Error("counter block allocation failed");
  return row.value;
}

/** Formats a counter value as a zero-padded human id, e.g. 1 -> "CAND-0001". */
export function humanId(prefix: string, value: number): string {
  return `${prefix}-${String(value).padStart(4, "0")}`;
}
