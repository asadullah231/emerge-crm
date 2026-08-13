# Milestone 6 - Activity Timeline, Tasks & Notes

- Version on completion: **v0.7.0**
- Status: Not started
- Complexity: **L**

## Objective

Introduce the domain event bus (ADR-0007) and build its first three consumers: the
activity timeline on every record, tasks, and notes, plus in-app notifications and the
applicant Triage inbox.

## User value

Every record answers "what has happened here?" at a glance; recruiters manage their to-dos
in-product; new applications land in a triage queue nobody can lose track of.

## Features included

- Domain event outbox + worker relay + typed event catalog (record.created,
  record.updated, application.stage_changed, note.added, task.completed, ...)
- Activity timeline (middle column of every record page, HubSpot pattern): chronological,
  filter chips by type, upcoming items (due tasks) pinned on top
- Notes: rich text, attach to any core record, @mention a teammate (fires notification),
  pin note
- Tasks: title, due date/time, assignee, linked record, priority; My Tasks view (due
  today / overdue / upcoming); complete/reopen
- Notifications: in-app inbox (bell) fed by events (@mention, task assigned, application
  stage moved on records you own, new portal application later); per-user read state;
  mark all read
- **Triage inbox v1:** new applications (any application created with source != manual)
  queue up; keyboard-driven processing: open, then single-key advance/reject/assign/skip
- Backfill: M2-M5 mutations now emit events (create/update wired through one helper)

## Database changes

`events` (outbox), `tasks`, `notes`, `notifications`. Stage events from M5 feed the
timeline without schema change.

## Backend changes

Event emission helper wrapping mutations transactionally; worker consumers (timeline is a
query-side projection, notifications a table write); mention parsing.

## Frontend changes

Timeline component + filters; task views + quick-add; note composer (reuses M4 rich
text); notifications popover; triage screen with keyboard handling.

## API changes

Routers `tasks`, `notes`, `notifications`, `triage`; timeline query endpoint per record.

## Dependencies

M2, M3, M4 (records to attach to); M5 (stage events into timeline + triage source).

## Acceptance criteria

1. Creating/updating/moving anything from M2-M5 produces a timeline entry within 2s
   (worker path) and survives worker restart (outbox replay).
2. Notes with @mention notify the mentioned user; tasks notify assignee on assignment
   and on due-today (daily worker job).
3. My Tasks shows correct buckets across timezones (user timezone respected).
4. Triage: an application created via import/API lands in triage; keyboard-only
   processing of 10 items works without touching the mouse.
5. Notification read state is per user; unread count accurate across two concurrent
   sessions.
6. Event catalog documented in packages/core with types; no consumer parses raw JSON
   without schema validation.

## Testing requirements

- Integration: outbox delivery + replay after simulated crash; mention parsing;
  timezone-sensitive task buckets.
- Playwright: note/@mention round-trip between two users; triage keyboard flow.

## Definition of Done

Standard checklist + tag `v0.7.0` + release "Milestone 6 - Timeline, Tasks & Notes".

## Estimated complexity

L. The outbox/consumer machinery must be boringly reliable; everything later leans on it.

## Explicitly OUT of scope

- Email in timeline (M12), calendar events (M10), automation reacting to events (M14),
  email digests of notifications (M14), webhooks (M14)

## Issue breakdown

1. M6-01 Event outbox + relay + typed catalog
2. M6-02 Wire M2-M5 mutations through the emission helper
3. M6-03 Timeline projection + component
4. M6-04 Tasks (model, router, views, due-date job)
5. M6-05 Notes + mentions
6. M6-06 Notifications inbox
7. M6-07 Triage v1
