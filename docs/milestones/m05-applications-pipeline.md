# Milestone 5 - Applications: Pipeline, Statuses & Kanban

- Version on completion: **v0.6.0**
- Status: **Completed (v0.6.0, 14 Aug 2026)**
- Complexity: **L**
- Depends on: M3 (candidates), M4 (jobs)

> Rewritten 14 Aug 2026 from the Zoho Recruit audit. The Application (candidate x
> job) is the product's heart: 756 records, the real pipeline our team lives in.
> The audit's model is a coarse 7-stage kanban plus a finer, workspace-configurable
> status dictionary (13 values we actually use, incl. the client-submission loop),
> with an append-only status history that powers funnels and time-in-stage.

## Objective

Associate a candidate to a job, move that application through a staged pipeline on
a kanban board, and remember every transition (who, when, from, to, why), with the
exact shape the Zoho migration (M8) and reports (M14) will build on.

## User value

Recruiters see and move every candidate through every job's hiring process
visually. The client-submission loop (submitted -> approved/rejected by client) is
first-class, rejections capture a reason, and nothing about a candidate's journey
is lost.

## Model

- **Stage** (fixed, 7): `screening | submitted | interview | offered | hired |
rejected | archived`. Drives the kanban columns and fast grouping.
- **Status** (fine, workspace-configurable dictionary): seeded with the 13 Zoho
  values we use - Associated, In Review, Unqualified, Submitted to client,
  Approved by client, Rejected by client, Interview to be scheduled, Interview
  scheduled, Interview in progress, Offer made, Hired, Rejected, Archived - each
  mapped to a stage, ordered, with terminal + entry flags. Each status carries
  its stage, so setting a status also sets the stage; moving a kanban card sets
  the stage and snaps to that stage's entry status.

## Features included

- Application CRUD: candidate + job (**unique pair** per workspace), current
  stage + status, rejection reason (free text; required-ish on the reject
  statuses), rating (1-5), owner (sourcer), source, per-stage entry timestamp,
  human id (APP-0001), soft delete + restore.
- Per-workspace status dictionary, seeded idempotently on first use (no change to
  the M1 signup path); `statuses` endpoint feeds the pickers.
- Append-only `application_status_history` (from/to status + stage, actor, note,
  timestamp); time-in-stage shown on the record.
- Kanban board (7 stage columns) per job and global, with native HTML5
  drag-and-drop between columns, optimistic move + rollback, column counts, cards
  showing candidate name/title/days-in-stage; read-only role cannot move.
- Fine status change control on the application (within/across stages), with a
  rejection-reason prompt on the reject statuses.
- Add-to-job flows: associate from the candidate record (pick a job) and from the
  job record (pick candidates); duplicate pair is blocked with a clear message.
- Real pipeline summary on the job record (counts by stage) and an applications
  list on the candidate record.

## Database changes

- `applications` (workspace-scoped; candidate FK + job FK, unique (workspace,
  candidate, job); stage enum; status_key text; rejection_reason; rating;
  owner FK; source; stage_entered_at; human_id; soft delete; indexes on
  (workspace, deleted), (workspace, job, stage), (workspace, stage),
  (workspace, candidate), unique (workspace, human_id)).
- `application_statuses` (workspace dictionary: key, label, stage, sort_order,
  is_entry, is_terminal; unique (workspace, key)).
- `application_status_history` (application FK cascade, from/to status + stage,
  actor, note, created_at; index (workspace, application, created_at)).
- RLS: ENABLE + `workspace_isolation` on all three in their creation migration.
- `application` + `app-status` counter reuse the M3 `counters` table.

## Backend changes

- Applications router: board / list / get / create / changeStatus / changeStage /
  updateMeta / softDelete / restore / statuses, with a status-machine helper that
  resolves a status_key to its stage and writes history on every transition;
  audit log on mutations; `ensureDefaultStatuses` seeds the dictionary lazily.
- `jobs.get` pipeline summary now returns real counts by stage; `candidates.get`
  returns the candidate's applications.

## Frontend changes

- `/pipeline` global kanban + job filter; a pipeline board section on the job
  record; an applications section on the candidate record; associate modals from
  both sides; stage columns tinted with the brand palette.

## API changes

- Router `applications`. No new route handlers.

## Migration requirements

- No data migration (green-field). The status dictionary + history are the target
  for the M8 Zoho status/timeline import.

## Acceptance criteria

1. A candidate can be associated to a job once (duplicate pair blocked); the
   application starts at the entry status/stage with a history row.
2. Moving a card on the kanban changes the stage, snaps the status, and appends a
   history row; read-only users cannot move.
3. Changing the fine status updates the stage accordingly; the reject statuses
   capture a rejection reason.
4. The job record shows real pipeline counts by stage; the candidate record lists
   its applications.
5. RLS isolates applications, statuses and history per workspace.

## Testing requirements

- Unit: status->stage resolution, entry/terminal flags, transition validation.
- DB (CI): application RLS, unique pair enforcement, stage/status change writes
  history, board grouping, default-status seeding idempotency.

## Definition of Done

Standard release checklist + tag `v0.6.0` + GitHub release
"Milestone 5 - Applications: Pipeline, Statuses & Kanban".

## Explicitly out of scope

- Formal Submissions module and client feedback links (M10); the status loop
  covers client submission here.
- Interviews scheduling + outcomes (M11); interview _statuses_ exist, the
  scheduling module does not.
- Offers/placements records and revenue (M12); `offer_made` / `hired` statuses
  exist, the offer lifecycle does not.
- Per-job custom pipelines and status-dictionary editing UI (per-workspace
  defaults only for now); notes/@mentions on applications (M6).
- Bulk actions and saved views (M9).

## Issue breakdown

1. M5-01 Schema + RLS (applications, statuses dictionary, status history)
2. M5-02 Applications router + status machine + record wiring
3. M5-03 Kanban board + associate flows + record integrations
4. M5-04 Tests + seed + verify + release
