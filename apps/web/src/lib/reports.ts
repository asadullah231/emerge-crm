/**
 * Client-safe report types + input schema. The computation + Drizzle queries
 * live in the server-only @emerge/reports package; the browser and the tRPC
 * input layer only need these shapes.
 *
 * The enum values + filter schema are defined HERE (not imported from
 * @emerge/reports) on purpose: importing the engine's `as const` tuples across
 * the package boundary widens their literal types in the Next/Docker type-check,
 * which breaks `z.enum(...)` inference. Web-local literals stay literal.
 */
import { z } from "zod";

export const REPORT_KEY_VALUES = [
  "funnel",
  "submissionsBySourcer",
  "timeInStage",
  "timeToFirstSubmission",
  "clientHealth",
  "leaderboard"
] as const;
export type ReportKeyValue = (typeof REPORT_KEY_VALUES)[number];

export const reportFiltersSchema = z.object({
  from: z.date().optional(),
  to: z.date().optional(),
  /** Application owner / sourcer. */
  userId: z.string().uuid().optional(),
  /** Client company. */
  companyId: z.string().uuid().optional()
});
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

export type ReportTable = {
  key: string;
  title: string;
  columns: string[];
  rows: (string | number | null)[][];
};
