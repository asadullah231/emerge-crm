/**
 * Client-safe report types. The computation + Drizzle queries live in the
 * server-only @emerge/reports package; the browser only needs these shapes
 * (kept structurally identical so tRPC results assign cleanly).
 */
export type ReportFilters = {
  from?: Date;
  to?: Date;
  userId?: string;
  companyId?: string;
};

export type ReportTable = {
  key: string;
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
};
