# Milestone 6 - Notes, @Mentions, Timeline & Notifications

- Version on completion: **v0.7.0**
- Status: **Completed (v0.7.0, 14 Aug 2026)**
- Complexity: **L**
- Depends on: M2-M5 (the records that carry notes + a timeline)

> Rewritten 14 Aug 2026 from the live Zoho Recruit audit. Every Zoho record has a
> Notes tab (a composer whose placeholder is literally "@mention to notify users")
> and a Timeline tab (a chronological activity feed, "No Activities available"
> when empty). A bell in the header carries the notification inbox. This
> milestone rebuilds those with a cleaner UI, adding a workspace note-template
> library, and an org-wide activity feed.

## Objective

Collaboration on every record: notes with @mentions that notify teammates, a
per-record timeline of everything that happened, an in-app notification inbox,
and an org-wide activity feed - the sourcer -> account-manager handoff Zoho does
with Notes + Timeline, done better.

## Zoho behaviour verified (Chrome)

- Candidate/Job/etc. record has tabs: Details, ..., **Notes**, **Timeline**.
- Notes: single composer with placeholder "@mention to notify users", a sort
  toggle (Recent First / Oldest First), and the note list below (author + time).
- Timeline: chronological activity ("No Activities available" when empty).
- Header bell shows an unread badge; it is the notification inbox.

## Features included

- **Notes** (polymorphic on candidate, job, company, contact, application):
  composer with inline @-mention autocomplete of workspace members, note list
  (author, relative time, body with highlighted @mentions), recent/oldest sort,
  edit + delete for your own notes (admins any). RLS workspace-scoped.
- **@Mentions**: picking a member inserts "@Name" and, on save, fans out a
  notification to each still-mentioned member (never to yourself). Deleting the
  "@Name" text before saving un-notifies that person.
- **Note templates** (workspace): seeded with Screening call / Client submission
  / Interview feedback; an "Insert template" picker in the composer.
- **Timeline** (per record): a merged, newest-first activity feed built from the
  existing audit log + the M5 application status history + M6 notes. No M1-M5
  code changed - it reads the events those milestones already record.
- **Notifications inbox**: a header bell with a live unread count (polled),
  a dropdown list ("<user> mentioned you on a <record>"), click-to-open the
  record, mark-one-read and mark-all-read.
- **Activity feed** (`/activity`): org-wide recent activity across the workspace,
  each row linking to its record.

## Database changes

- `notes` (workspace-scoped, polymorphic entity_type + entity_id, author FK,
  body, soft delete; indexes on (workspace, entity, deleted) + (workspace, author)).
- `note_mentions` (note FK cascade, user FK; unique (note, user)).
- `notifications` (recipient FK, kind enum [mention], actor FK, entity_type +
  entity_id, note FK, read_at; indexes on recipient + recipient/unread).
- `note_templates` (workspace name + body, seeded on first use).
- RLS: ENABLE + `workspace_isolation` on all four in their creation migration.

## Backend changes

- `notes` router: list / create / update / remove / templates, with mention
  fan-out to notifications (validated against active members), author-or-admin
  edit/delete, audit on create.
- `timeline` router: `forRecord` (merged audit_log + application_status_history +
  notes) and `feed` (org-wide). Reads existing sources; no M1-M5 changes.
- `notifications` router: list / unreadCount / markRead / markAllRead, scoped to
  the signed-in recipient.

## Frontend changes

- Reusable `NotesPanel`, `TimelinePanel`, `MentionTextarea` (@-autocomplete),
  `NotificationBell`. Notes + Timeline sections added to the candidate, job,
  company, contact and application records. Bell added to the app header.
  `/activity` page + an Activity nav item.

## API changes

- Routers `notes`, `timeline`, `notifications`. No new route handlers.

## Migration requirements

- No data migration (green-field). Notes + history are the target for the M8
  Zoho notes/timeline import.

## Acceptance criteria

1. A note can be added to any record; it lists with author + relative time and
   is workspace-isolated.
2. @-mentioning a member notifies them (inbox + unread badge); the author is
   never notified; removing the mention text before saving un-notifies them.
3. The Timeline shows the record's activity newest-first (created, field/status
   changes, notes) with no duplicate note lines.
4. The header bell shows the unread count, lists notifications, opens the record,
   and marks read (single + all).
5. Read-only users can read notes/timeline but cannot post.

## Testing requirements

- Unit: mention-in-body filtering (present/absent/dedupe), template presence,
  relative-time formatting.
- DB (CI): notes RLS isolation, mention -> notification fan-out (recipient yes,
  author no), notification mark-read.

## Definition of Done

Standard release checklist + tag `v0.7.0` + GitHub release
"Milestone 6 - Notes, @Mentions, Timeline & Notifications".

## Explicitly out of scope

- Tasks / calls / events / reminders (Zoho Activities) - a later milestone.
- Email send + logging to the timeline (M13).
- Real-time push (websockets); the bell polls for now.
- Structured skills, custom fields UI, saved views (M9 / post-1.0).

## Issue breakdown

1. M6-01 Schema + RLS (notes, mentions, notifications, templates)
2. M6-02 Routers (notes + timeline + notifications)
3. M6-03 UI (NotesPanel, TimelinePanel, @mention textarea, bell, activity feed)
4. M6-04 Tests + seed + verify + release
