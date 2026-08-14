import { asc, desc, ilike, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { z } from "zod";

/**
 * Shared input shape for every list endpoint (M2+). Pagination is fixed at a
 * 50-row default page; sort keys are whitelisted per-router via `sortable`.
 */
export const listInput = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
  sortBy: z.string().max(50).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
  search: z.string().trim().max(200).optional(),
  /** true = trash view (soft-deleted rows only). */
  deleted: z.boolean().default(false)
});

export type ListInput = z.infer<typeof listInput>;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/**
 * Turns a ListInput into drizzle clauses. Unknown sort keys fall back to the
 * default so client input can never reference an unindexed column.
 */
export function buildListClauses(
  input: ListInput,
  opts: {
    sortable: Record<string, AnyPgColumn>;
    searchable: AnyPgColumn[];
    defaultSort: string;
  }
): { orderBy: SQL; searchWhere: SQL | undefined; limit: number; offset: number } {
  const sortCol =
    opts.sortable[input.sortBy ?? opts.defaultSort] ?? opts.sortable[opts.defaultSort];
  if (!sortCol) throw new Error(`Unknown default sort column: ${opts.defaultSort}`);
  const orderBy = input.sortDir === "desc" ? desc(sortCol) : asc(sortCol);
  const searchWhere =
    input.search && input.search.length > 0
      ? or(...opts.searchable.map((c) => ilike(c, `%${escapeLike(input.search!)}%`)))
      : undefined;
  return {
    orderBy,
    searchWhere,
    limit: input.pageSize,
    offset: (input.page - 1) * input.pageSize
  };
}

/** Soft-deleted records can be restored for this long (trash retention). */
export const TRASH_RETENTION_DAYS = 30;

export function trashCutoff(now = new Date()): Date {
  return new Date(now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Lowercased registrable host of a URL or bare domain, used for company
 * duplicate detection. Returns null when nothing host-like can be extracted.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  const raw = input.trim().toLowerCase();
  if (!raw) return null;
  try {
    const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = url.hostname.replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}
