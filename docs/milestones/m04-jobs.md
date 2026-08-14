# Milestone 4 - Jobs (client-owned, AM-routed)

- Version on completion: **v0.5.0**
- Status: **Completed (v0.5.0, 14 Aug 2026)**
- Complexity: **M**
- Depends on: M1 (auth/RLS), M2 (companies + list engine + record primitives)

> Rewritten 14 Aug 2026 from the Zoho Recruit audit. Jobs (Zoho "Job Openings",
> 101 records) are what an agency works to fill. Every job belongs to a client
> company and is routed to an account manager. This milestone builds the job
> object and its record page; the candidate pipeline that hangs off a job lives
> on Applications (M5), so here the record shows a pipeline summary placeholder.

## Objective

A job object that an account manager can open against a client, describe, price,
and track through a slim lifecycle, with the field shape the Zoho migration (M8)
and the applications pipeline (M5) will build on.

## User value

Account managers keep every open role in Emerge tied to its client and hiring
contact, with a clear status, headcount, salary and description. The team can see
what is open, on hold or filled at a glance and drill into a single role.

## Features included

- Job CRUD: title, client company (**required**), optional hiring contact (must
  belong to the chosen company), account-manager owner, status
  (open | on_hold | filled | cancelled | inactive), employment type
  (permanent | contract | temporary), work mode (onsite | hybrid | remote),
  location, number of positions, opened date, target close date, long-form job
  description, free-text salary plus an optional structured range
  (min / max / currency / period), custom_fields reserved, soft delete + 30-day
  trash restore.
- Human id per job (JOB-0001) from the per-workspace counter (M3 mechanism).
- Job list (M2 DataTable: search, sort, trash, status + human-id + company +
  owner columns) and a record page (inline profile editors, description panel,
  client + hiring-contact links, pipeline summary).
- Quick status change on the record (open -> on_hold -> filled, etc.), audit
  logged.
- Pipeline summary section on the record page: a placeholder that reads zero
  until Applications (M5) land, wired so M5 only has to fill it in.
- New-job modal with a required company picker and a hiring-contact picker
  scoped to that company.

## Database changes

- `jobs` (workspace-scoped, company FK **not null**, optional hiring-contact FK,
  account-manager owner FK, status enum, employment-type enum, work-mode enum,
  human_id, positions, opened/target dates, structured salary fields,
  custom_fields jsonb, soft delete; indexes on (workspace, deleted),
  (workspace, status), (workspace, company), (workspace, title), unique
  (workspace, human_id)).
- `job` counter row reuses the M3 `counters` table.
- RLS: ENABLE + `workspace_isolation` policy on `jobs` in its creation migration
  (M1 pattern; grants inherited from migration 0002).

## Backend changes

- Jobs router: list/get/create/update/softDelete/restore/changeStatus. Create
  requires a company in the workspace and validates the optional hiring contact
  belongs to it; human-id allocated inside the create transaction; audit log on
  every mutation. `get` returns the job with its company, hiring contact, tags
  and a pipeline summary (zeroed until M5).
- List joins company + owner for display columns; search covers title,
  human_id, location.

## Frontend changes

- Job list + record pages from M2 primitives; status badge; description panel;
  client and hiring-contact links; pipeline summary section; quick status
  control. New-job modal with company (required) + hiring-contact pickers.
- `JOB_STATUS_OPTIONS`, `JOB_EMPLOYMENT_OPTIONS`, `JOB_WORK_MODE_OPTIONS` and a
  job `JobStatusBadge` added to the shared record components.

## API changes

- Router `jobs` (list, get, create, update, softDelete, restore, changeStatus).
  No new route handlers.

## Migration requirements

- No data migration in M4 (green-field table). The field shape is fixed here so
  M8 (Zoho Job Openings import) populates it without schema churn, and M5
  (Applications) attaches to `jobs.id`.

## Acceptance criteria

1. Job CRUD, permissions (read-only blocked from writes), soft delete + restore
   work per M2 patterns; human id assigned as JOB-0001, JOB-0002, ...
2. Creating a job without a company is rejected; a hiring contact that does not
   belong to the chosen company is rejected.
3. Status can be changed through the slim set and is reflected on the list and
   record with a status badge; the change is audit logged.
4. The record page links to the client company and hiring contact and shows a
   pipeline summary that reads zero (Applications arrive in M5).
5. List stays responsive with the seeded jobs and supports search + sort + trash.

## Testing requirements

- Unit: job input validation (title/company required, status enum), salary and
  positions bounds, human-id formatting.
- DB (CI): job RLS isolation, human-id counter for jobs, company-required
  enforcement, hiring-contact-belongs-to-company check, status change.

## Definition of Done

Standard release checklist + tag `v0.5.0` + GitHub release
"Milestone 4 - Jobs".

## Explicitly out of scope

- Applications / candidate pipeline / kanban (M5); the record shows a summary
  placeholder only.
- Notes and timeline on the job (M6).
- Rich-text formatting toolbar for the description (stored as long text now;
  editor stays a plain textarea, consistent with M2/M3).
- Global search, saved views, bulk actions (M9); list has quick search only.
- Job-board multiposting and a public careers page (post-1.0 / M16).

## Issue breakdown

1. M4-01 Schema: jobs table + enums + RLS migration
2. M4-02 Jobs router (CRUD + changeStatus + validation)
3. M4-03 Jobs list + record page + status badge
4. M4-04 New-job modal (company + hiring-contact pickers)
5. M4-05 Tests + seed + verify + release
