# Milestone 5 - Applications & Pipeline Board

- Version on completion: **v0.6.0**
- Status: Not started
- Complexity: **L**

## Objective

The heart of the ATS: the Application object joining Candidate and Job, moving through a
staged pipeline on a drag-drop kanban board. This is OpenCATS `candidate_joborder` +
status codes, rebuilt properly with stage history.

## User value

Recruiters see and move every candidate through every job's hiring process visually, and
the system remembers every transition (who, when, from, to, why).

## Features included

- Application model: candidate x job (unique pair), current stage, rejection
  reason (structured list + free text), source, added-by
- Default pipeline seeded per workspace: Sourced -> Applied -> Screening -> Submitted ->
  Interview -> Offer -> Placed | Rejected. Admins can rename/add/reorder/archive stages
  (per-workspace pipeline v1; per-job pipelines deferred)
- Kanban board per job: dnd-kit drag-drop, optimistic move + rollback, card shows
  candidate name/headline/tags/days-in-stage; column counts; collapse columns
- Stage history: append-only `application_stage_events`; time-in-stage visible on card
  hover and application detail
- Add-to-job flows: from candidate page (pick job), from job page (pick candidates,
  multi-select), bulk add
- Rejection flow: reason required; rejected column collapsed by default
- Application list view (table alternative to board) with stage filter

## Database changes

`pipelines`, `stages` (workspace-scoped, position, type: standard/placed/rejected),
`applications`, `application_stage_events`.

## Backend changes

Stage-move service with transactional history write (event emission wired in M6 without
rework: the stage event table IS the source), pipeline admin endpoints, uniqueness +
"already in process" guard.

## Frontend changes

Kanban board component (dnd-kit + virtualized columns), application card, stage admin
settings UI, add-to-job pickers, rejection dialog.

## API changes

Routers `applications`, `pipeline`.

## Dependencies

M3, M4.

## Acceptance criteria

1. Dragging a card moves the application instantly (optimistic) and persists; on server
   error the card returns with a visible toast.
2. Every move writes a stage event with actor + timestamps; history renders on the
   application detail panel.
3. Duplicate candidate+job application is blocked with a clear message linking to the
   existing application.
4. Moving to Rejected requires a reason; moving to Placed is allowed but flagged
   "pending placement record" (until M11 formalizes placements).
5. Stage admin: rename/add/reorder/archive works; archiving a stage with active
   applications forces a migration choice.
6. Board stays smooth (60fps drag) with 200 cards per column (virtualized).

## Testing requirements

- Integration: move service invariants, history append-only, uniqueness, stage admin
  edge cases (archive-with-cards).
- Playwright: drag-drop move, bulk add, reject flow.

## Definition of Done

Standard checklist + tag `v0.6.0` + release "Milestone 5 - Applications & Pipeline".

## Estimated complexity

L. Drag-drop polish + stage-admin edge cases are the time sinks.

## Explicitly OUT of scope

- Triage inbox (M6, needs notifications), stage automations (M14), client submission
  portal (post-1.0), per-job custom pipelines (post-1.0), board saved views (M8)

## Issue breakdown

1. M5-01 Schema: pipelines/stages/applications/stage_events + seed
2. M5-02 Stage-move service + applications router
3. M5-03 Kanban board + card + virtualization
4. M5-04 Add-to-job + bulk flows + rejection dialog
5. M5-05 Pipeline admin settings
6. M5-06 Application table view + tests
