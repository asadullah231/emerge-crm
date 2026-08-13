# Milestone 15 - Reports & Analytics

- Version on completion: **v0.16.0**
- Status: Not started
- Complexity: **L**

## Objective

Turn the event history the product has been accumulating since M5/M6 into recruiter and
owner dashboards: no add-on product, no export-to-Excel required (Zoho's reporting
weakness is the opening).

## User value

Owners see revenue, pipeline health, and team performance; recruiters see their desk;
both without leaving the product or paying extra.

## Features included

- Workspace dashboard: placements + fees (period comparison), open jobs by status/age,
  pipeline funnel (stage conversion rates), time-to-fill trend, source effectiveness
  (portal / referral / import / manual -> placement rate)
- Recruiter dashboard (per user): my activity counts (calls logged as tasks, emails,
  submissions, interviews), my pipeline, my placements vs period
- Job analytics tab: funnel for this job, time-in-stage breakdown (from
  application_stage_events), drop-off stages, days-open
- Report builder v1: pick object -> filters (M8 AST reuse) -> group by field -> metric
  (count/sum/avg) -> table or bar/line/donut chart; save + share reports; scheduled
  email of a report (weekly, uses M12 send)
- CSV export on every report and every list view (respecting permissions)
- Materialized rollups refreshed by worker (nightly + on-demand) for heavy aggregates;
  live queries for small ones

## Database changes

Rollup tables (`stats_pipeline_daily`, `stats_source_daily`, ...), `reports` (saved
definitions). No changes to source-of-truth tables.

## Backend changes

Aggregation queries over stage events/placements, rollup jobs, report definition
compiler (reuses M8 filter AST + group/metric layer), chart-data endpoints.

## Frontend changes

Dashboard pages (dataviz-consistent chart kit: bar/line/donut/funnel/stat tiles),
report builder UI, export buttons, schedule dialog.

## API changes

Routers `dashboards`, `reports`.

## Dependencies

M5/M6 (stage events + event history), M11 (placements/fees), M8 (filter AST), M12
(scheduled report email).

## Acceptance criteria

1. Funnel conversion and time-in-stage figures reconcile exactly with a hand-computed
   fixture dataset (golden numbers test).
2. Source effectiveness attributes placements to the original candidate source
   correctly across the seeded scenarios.
3. Report builder: "placements by company, last quarter, sum of fees" buildable in
   under a minute, saveable, exportable, schedulable.
4. Dashboards load < 1s P95 on the 10k seed (rollups, not live scans).
5. A Read-only user sees dashboards but cannot schedule/export beyond their permission.
6. All charts legible in light + dark themes.

## Testing requirements

- Integration: golden-number aggregation fixtures, rollup refresh idempotency, report
  compiler tests, permission checks on export.
- Playwright: build/save/schedule a report; dashboard render smoke.

## Definition of Done

Standard checklist + tag `v0.16.0` + release "Milestone 15 - Reports & Analytics".

## Estimated complexity

L.

## Explicitly OUT of scope

- Custom SQL/formula fields in reports, cohort analysis, forecasting, EEO/DEI compliance
  reporting (corporate-HR, post-1.0), embedded BI tools

## Issue breakdown

1. M15-01 Rollup tables + jobs
2. M15-02 Workspace + recruiter dashboards
3. M15-03 Job analytics tab
4. M15-04 Report builder (compiler + UI)
5. M15-05 Exports + scheduled reports
6. M15-06 Golden-number fixture suite
