import { z } from "zod";
import { REPORT_KEYS, REPORT_LABELS, reportFilters, runReport } from "@emerge/reports";
import { router, workspaceProcedure } from "../trpc";

export const reportsRouter = router({
  /** The report catalog for the picker. */
  catalog: workspaceProcedure.query(() => {
    return REPORT_KEYS.map((key) => ({ key, label: REPORT_LABELS[key] }));
  }),

  /** Run one report with the given filters; returns a tabular result. */
  run: workspaceProcedure
    .input(z.object({ key: z.enum(REPORT_KEYS), filters: reportFilters.default({}) }))
    .query(async ({ ctx, input }) => {
      return runReport(ctx.tx, ctx.workspaceId, input.key, input.filters);
    })
});
