# Changelog

All notable changes to Emerge CRM. Format loosely follows Keep a Changelog;
versions follow semantic versioning (one minor version per completed milestone).

## v0.21.0 - Milestone 18: Candidate Matching and Semantic Search (2026-08-19)

"Find candidates for this job" and "find jobs for this candidate" over the real
corpus, closing the Zoho Zia matching audit item.

### Added

- **Matching candidates on the job record.** Every live candidate is scored
  against the job (skills 55, title 25, description mentions 10, location 10)
  and the top 10 show with score badges, matched-skill chips, an In-pipeline
  marker and one-click Associate.
- **AI rank.** One button refines the shortlist through the workspace's own
  LLM (the same bring-your-own-key settings the CV parser uses): each
  candidate gets an AI score and a one-line recruiter-style reason, including
  implied skills the lexical scorer cannot see.
- **Matching jobs on the candidate record:** the same scoring against every
  open job, with Associate.
- **AI search on the candidates list.** The query is expanded into related
  skills, tools and titles (React also finds Next.js and Redux) and candidates
  matching any term are listed with the terms they matched.

## v0.20.0 - Milestone 17c: Hiring Pipeline Tab and Record Depth (2026-08-19)

Third slice of the Job Openings parity sweep, centered on the Hiring Pipeline
view the client walked through on the Zoho call.

### Added

- **Hiring Pipeline tab** on the application record (Zoho parity): stage
  stepper with done/current/pending states and days in stage, a per-status
  timeline with date ranges, durations, actors and the transition comment, a
  pinned Current Status badge, and a one-click "Move to next status" action
  with comment, @mentions and a required rejection reason when the next status
  rejects. A related-lists sidebar shows live counts (Notes, Documents,
  Interviews, Reviews, Client submissions, To-dos, Emails) and jumps straight
  to the matching Overview section.
- **Ratings and reviews** on the application record: 1 to 5 star reviews from
  the recruiter, interviewer or client perspective with comments (new
  `reviews` table, migration 0026); reviewers or admins can delete.
- **Job record depth:** aggregated Interviews list across the job's
  applications with a Schedule action, an email Communication panel on the job
  record, and a Duplicate action that clones a job into a fresh open opening.
- **Interview reminders.** The worker now emails interviewers and the
  organizer once when a scheduled interview starts within the hour
  (`interviews.reminder_sent_at` guards against double sends).

## v0.19.0 - Milestone 17b: Job Openings Views, Bulk Actions and Import (2026-08-19)

Second slice of the Job Openings parity sweep: list power features matching
Zoho's views, mass actions and import.

### Added

- **Preset views.** All / Mine / Recent (30d) / In-progress chips on the jobs
  list, one click each (Zoho preset views parity).
- **More filters.** Owner, client, country, employment type, work mode and a
  hot-only toggle join the status and tag filters; saved views capture all of
  them.
- **Bulk actions.** Change status (with the same close-date rules as single
  edits), reassign owner (Zoho Mass Transfer) and update fields (employment
  type, work mode, hot flag, target date) on any selection up to 500 jobs.
- **Full CSV export.** The Export CSV button now exports the entire filtered
  result set server side (up to 10,000 rows), not just the visible page;
  selection export stays on the bulk bar.
- **CSV import wizard.** New /jobs/import mirrors the candidates importer:
  upload, column auto-mapping, dry-run preview, per-row errors. Client
  companies are resolved by name and can be created on the fly.

### Changed

- **Pipeline board redesign.** Recessed columns with stage dots, elevated
  candidate cards with initials avatars, drag auto-scroll, viewport-fit
  height, thin hover-only scrollbars and polished empty states.

## v0.18.0 - Milestone 17a: Job Openings Parity, Fields & Data Integrity (2026-08-18)

First slice of the Job Openings parity sweep driven by the deep Zoho audit of
18 Aug (vault: "Zoho vs Emerge - Job Openings gap analysis"). Planned
milestones shifted by one: Matching is now M18 / v0.21.0 and v1.0.0 ships at
M22.

### Added

- **Auto close date.** New `jobs.closed_at` (migration 0025) stamped when a
  job enters Filled / Cancelled / Declined and cleared on reopen (Zoho
  `Date_Closed` behaviour). Shown on the job record footer.
- **New job fields end to end:** target date (create modal + record), salary
  period, required skills, structured address (city / province / country /
  postal code), and a hot-job flag with a 🔥 badge on the list and record
  (Zoho `Is_Hot_Job_Opening`).
- **Three new job statuses** matching Zoho's picklist: Waiting for approval,
  Declined, Submitted by client; "Open" is now labelled "In-progress".
- **Trash integrity fix.** Trashing a job now archives its live applications
  with a status-history note (Zoho "Archived from Jobs" parity) instead of
  leaving them active on a dead pipeline.
- **Wider job search.** The command palette now matches jobs on description,
  client call summary, required skills, city, country, client name and owner
  name; job hits show the client as the sublabel.
- **Skill chips.** Candidate Skills and job Required skills render as pill
  chips with a +N expander (Zoho Skill Set look) instead of a comma blob;
  editing stays a textarea. Candidate list search and the command palette now
  match on skills, so searching a skill finds the people who have it.
- **Structured job descriptions.** Migrated one-line JDs render with bold
  section headings (Job Role, Location, Salary, ...) and bulleted Must-haves /
  Requirements; the stored text is untouched and editing opens the raw
  textarea.
- **Kanban usability.** Pipeline columns now stretch to fill the screen (no
  horizontal scrollbar on wide displays) and the board auto-scrolls, both
  sideways and inside a column, while a card is dragged near an edge, so a
  card can travel Screening to Archived in one motion.

## v0.17.0 - Milestone 16: Client Feedback R2, Mention Emails & Stage Comments (2026-08-18)

Mo's second feedback round.

### Added

- Email fan-out for @mentions on any record (notes create/update), in
  addition to the in-app bell.
- Atomic application stage change with an optional inline note (mentions
  supported) and a required rejection reason when moving to Rejected.
- "Move to next stage" widget on the application record page + matching
  modal on kanban drop.
- Rejection reason surfaced on the application header + timeline entry.

## v0.16.0 - Milestone 15: Client Feedback R1, Intake Flow & Job Collaboration (2026-08-17)

First client-feedback round (Mo). Planned milestones shifted by one: Matching is
now M16 / v0.17.0 and v1.0.0 ships at M20.

### Added

- **Parse-to-pipeline flow.** Confirming a parsed CV can now, in the same step,
  associate the candidate with an open job opening (application + entry status +
  history), tag the account manager with an @mention (lands in the notification
  bell) and save the screening call notes as a note on the application.
- **Quick-create client.** A "+ New client" button inside the New job opening
  modal creates the client and selects it in place, without leaving the form.
- **Client call summary on jobs.** New `client_call_summary` column (migration
  0024), captured in the create modal and editable on the job record.
- **Job attachments.** Jobs now carry documents: job description and client
  meeting summary (new `attachment_kind` values) plus other files. Upload from
  the create modal or the job record's new Attachments section; download via
  presigned URL; delete. New `POST /api/jobs/[id]/documents` route.
- **New-job email notification.** Posting a job opening emails every other
  active member the job facts, the client call summary and a deep link. New
  `job-posted` email job + branded template in `@emerge/email`.
- **Zoho-familiar terminology.** Nav and pages now say "Job Openings" and
  "Clients" to match what the team knows from Zoho Recruit.

## v0.15.0 - Milestone 14: Agency Reports & Analytics (2026-08-16)

### Added

- **Reports page** (`/reports`) with six agency KPI reports over the live,
  RLS-scoped pipeline: pipeline funnel + conversion, submissions per sourcer,
  average time in stage, time to first submission, client health, and a recruiter
  leaderboard. Each runs with date / owner / client filters.
- **Per-report CSV export** from the browser, and a **funnel bar visualisation**.
- **Scheduled email delivery.** New `report_schedules` table (migration 0023) +
  a worker sweep that emails a due report as a CSV attachment on a daily / weekly
  / monthly cadence (rides on the M13 email transport). Schedules are managed
  inline on the Reports page (create, pause/resume, delete).
- New server-only **`@emerge/reports`** package holds the aggregate computations
  and scheduling math, shared by the web app and the delivery worker.

> The live `/dashboard` command centre (shipped ahead of schedule in M6-era work)
> already covers the at-a-glance KPI cards; M14 adds the filterable report
> surface, CSV export, and scheduled delivery on top.

## v0.14.0 - Milestone 13: Email Integration (2026-08-16)

### Added

- **Send email from a record.** A Communication panel on candidate, contact,
  application and company records: compose a message, pick a template, and send
  over SMTP/Resend. New `emails` table (migration 0021) logs every message
  (direction, status, subject, body, recipients, provider ids) with a per-record
  thread; the send is queued to the existing email worker and the row is updated
  to sent/failed on delivery.
- **Templates + merge fields.** Per-workspace `email_templates` (managed in
  Settings -> Email templates) with `{{candidate.firstName}}` /
  `{{job.title}}` / `{{company.name}}` style merge fields resolved per record at
  send time, then wrapped in the branded email layout.
- **Mail merge.** From the candidates list bulk bar: pick a template and send it
  personalised to the whole selection; records without an email are skipped and
  reported.
- **Inbound reply capture.** A public `/api/email/inbound` webhook (Resend
  Inbound) threads a reply back onto the originating record via a Reply-To token,
  logs it as an inbound message, marks the original replied, and notifies the
  sender. Full two-way mailbox sync stays post-1.0.

## v0.13.0 - Milestone 12: Offers, Placements & Job Revenue (2026-08-16)

### Added

- **Offers.** Offer lifecycle on an application (migration 0020): draft -> sent
  -> accepted / declined / withdrawn, plus auto-`expired`, with an append-only
  `offer_status_history`. Salary, currency, start date, medium and an optional
  offer-letter body. `offers` router: create, update (draft only), send (with
  expiry), accept, decline, withdraw, get, byApplication. Sending moves the
  application to `offer_made`; accept -> `offer_accepted`; decline/withdraw ->
  the terminal `offer_declined` / `offer_withdrawn` statuses (3 new statuses
  added to the M5 dictionary on the offered/rejected stages).
- **Expiry cron.** A BullMQ scheduler (every 5 min) flags sent offers past their
  expiry as `expired`, writing status history + audit across all workspaces.
- **Placements.** A `placements` record on hire (start date, fee/revenue,
  placed-by, linked offer), one per application; recording it moves the
  application to `hired`. `placements` router: create, forApplication, byJob,
  list, remove.
- **Job revenue.** `job_revenue` target (revenue-per-position) per job. `revenue`
  router: summary (expected vs actual vs missed rolled up per job, per client and
  per account manager), forJob, setTarget, recentPlacements. New `/revenue` page,
  a revenue panel on job + client records, and an offer/placement panel on the
  application with an expiry countdown.

## v0.12.0 - Milestone 11: Interviews & Tasks (lite) (2026-08-16)

### Added

- **Interviews.** Interview records on an application (migration 0019): type
  (screen/L1-L4/client/final), status FSM (scheduled/completed/cancelled/
  no-show), datetime + duration, location/meeting link, and participants (internal
  users + external client contacts). `interviews` router: schedule, get,
  byApplication, mine, update (reschedule bumps the iCal sequence), setStatus.
  Scheduling, rescheduling and cancelling land on the application timeline.
- **ICS invites.** Each interview downloads as a standards-compliant `.ics`
  (importable into Google/Outlook) with organizer + attendees; SMTP delivery
  rides on the email milestone.
- **Feedback scorecards.** One scorecard per interviewer (rating 1-5 +
  recommendation strong-yes/yes/no/strong-no + comments), immutable 15 minutes
  after first submit, aggregated on the application.
- **Tasks (lite).** A minimal task (subject, due date, assignee, status)
  attachable to any record, with overdue highlighting, a per-record task list,
  and a My Tasks view. My Interviews day/week list. Both wired into the nav.

## v0.11.0 - Milestone 10: Client Submissions & Feedback (2026-08-16)

### Added

- **Submissions.** A formal "sent this candidate to the client" record layered
  on the M5 application. New `submissions` table (RLS, migration 0018) with a
  status machine (submitted/approved/rejected/archived), medium, batch id and a
  hashed share token. `submissions` router: create (single or bulk for one job),
  byJob, byClient, forApplication, revoke. Sending moves each application to
  `submitted_to_client` and logs it on the timeline.
- **Submit to client dialog.** From an application or a job: pick the
  candidate(s), add a note and an optional link expiry, and get a tokened share
  link shown once.
- **No-login client review.** A public `/share/[token]` page shows the submitted
  candidate(s) with their CV and an Approve / Reject (with reason) control. The
  verdict writes back to the application (`approved_by_client` /
  `rejected_by_client`), records the client's comment, and notifies the owner.
  Unknown, revoked or expired tokens 404. Public endpoints are rate-limited.
- **Submission logs** on the job, company and application records, with a badge
  for each verdict and a revoke action for still-open links.

## v0.10.0 - Milestone 9: Global Search, Filters, Saved Views & Bulk Actions (2026-08-15)

### Added

- **Global command search.** A Cmd/Ctrl-K palette searches candidates, jobs,
  companies and contacts in parallel (name, email, title, employer, human id,
  domain, industry, location) and jumps to the record. `search` router +
  `CommandPalette`, mounted in the app shell with a header Search button.
- **Tags UI.** `TagEditor` on every candidate/company/contact/job record: add
  existing tags or create one (7-colour palette) and remove them. `TagFilter`
  chip bar on each list narrows to records carrying all selected tags (AND).
  `tagIds` filter on every list router via a `taggedEntityIds` subquery.
- **Bulk select & actions.** `DataTable` gains a selection column (row +
  page). A `bulk` router (softDelete / restore / addTag) acts on the selected
  set, RLS-scoped and audited. `BulkBar` action bar: add tag, delete (restore
  in trash), export CSV, clear.
- **CSV export** of the selected rows, client-side, per-object columns.
- **Saved views & filter builder.** New `saved_views` table (workspace-shared,
  per object type) + RLS + migration 0017. `views` router (list/create/delete)
  and a `ViewsBar` to apply, save and delete named views. A structured field
  filter per object (candidate source, company status, job status, contact
  primary) added to each list router and folded into the saved-view payload.

## v0.9.0 - Milestone 7: Resume Parsing & AI Settings (2026-08-15)

### Added

- **Resume parsing & bulk CV intake.** New `parse_jobs` table (RLS) tracks a CV
  from upload -> parse -> review -> confirm. A `/candidates/parse` page: drag-drop
  bulk upload, a status-tabbed review queue that polls as CVs parse, a review
  modal to edit the parsed fields (with a duplicate-email warning) and confirm to
  create the candidate + education/experience + the CV re-linked as a `cv`
  attachment, and retry/discard triage on failures. Upload route + `parsing`
  router (counts/list/get/confirm/retry/discard) + a BullMQ `parse` worker.
- **Per-workspace, multi-provider AI (bring-your-own-key).** New `@emerge/ai`
  package: provider presets (Anthropic native + OpenAI-compatible covering
  OpenAI, OpenRouter, DeepSeek, Google Gemini, Groq, Mistral, xAI, and any custom
  endpoint), AES-256-GCM secret crypto, a provider-agnostic resume parser (PDFs
  read natively by Anthropic; text via unpdf/mammoth otherwise), and a verify
  (test-connection). New `workspace_ai_settings` table stores each workspace's
  provider + model + **encrypted** key. New **Settings > AI** page + `ai` router
  (providers/get/save/test), admin-only; keys are never returned to the client
  (last 4 only). The parse worker uses each workspace's own key.
- Verified on the real corpus: 5 DACH/EU CVs parsed cleanly via Claude
  (names/titles/emails/education/experience extracted, no invented emails on
  blind CVs). Closes audit gap H6.

### Fixed

- Contain the `/pipeline` board in a bordered card so its stage columns scroll
  inside a box instead of the page.

### Added (earlier in this cycle)

- **Attachment (CV) backfill** for the `@emerge/migration` engine: a live-Zoho
  attachment phase (`zoho.ts` OAuth client + `s3.ts` MinIO putter +
  `attachments.ts`) that resolves each candidate via `external_refs`, lists
  their Zoho attachments, downloads the bytes, uploads them to MinIO under the
  same key convention the CRM serves from, and records an `attachments` row +
  `external_ref` + `import_record`. Idempotent, resumable, dry-run, bounded
  concurrency. New CLI subcommand `attachments`.
- Client-side request rate-gate (`--min-interval`) plus single-flight token
  refresh and retry-on-400 for downloads, after Zoho throttled bursty
  concurrent calls with transient HTTP 400s.

### Data

- Backfilled **1,500 candidate attachments** (CVs) into production MinIO across
  **1,295 of 1,297** candidates (the other 2 have no attachment in Zoho), 0
  failures. Recruiters can now download a candidate's CV from the record.
  Closes audit gap H2. No M1-M5 code changed.

## v0.8.0 - Milestone 8: Zoho Migration & Import Engine (2026-08-14)

Pulled ahead of Milestone 7 Resume Parsing on Asad's direction - the switch-
over risk (1,296 candidates, 762 applications, 1,218 notes to move over) was
judged bigger than the intake risk. Resume Parsing becomes v0.9.0.

### Added

- New `@emerge/migration` package: transformers, validators, importer,
  verifier, rollback and CLI (`emerge-migrate`), all decoupled from the web app
- New tables `external_refs` (idempotent Zoho -> Emerge id map),
  `import_runs`, `import_records` with row-level security in their creation
  migration
- Read-only Zoho snapshot workflow to JSONL under `.migration/snapshot/`
  (gitignored: contains real PII), and a proposed user-map generator
  (`build-user-map` CLI) that collapses many Zoho user ids into one Emerge
  identity per canonical email
- Full field map, per-entity transformer, and value maps for all 30 Zoho
  application statuses (both actual_value and display-value keys), plus job
  status, employment type and candidate source; unknown values preserved as
  `archived / imported_unknown` and reported
- Bulk-insert path (200-row multi-value INSERT chunks + batched external_refs
  and import_records) so 3,500-row imports fit in minutes rather than hours
  over the VPS's ~340 ms RTT
- CLI subcommands: `build-user-map`, `dry-run`, `import`, `rollback`,
  `verify`; the dry-run writes a JSON report with per-entity would-create
  counts, duplicate names, and unmapped statuses
- Docs: [`docs/audit/zoho-data-migration-map.md`](docs/audit/zoho-data-migration-map.md)
  (the API-verified plan) and [`docs/milestones/m08-zoho-migration.md`](docs/milestones/m08-zoho-migration.md)
- Tests: transformers, mention extraction, HTML sanitizer, status maps,
  user-map dedup - all on synthetic fixtures (repo is public; no real PII in
  the repo)

### Notes

- Attachment/CV file migration and historical @mention notifications remain
  gated follow-ups within this milestone; see the m08 spec for scope details
- Zoho stays read-only throughout; the engine only writes to Emerge

## v0.7.0 - Milestone 6: Notes, @Mentions, Timeline & Notifications (2026-08-14)

### Added

- Notes on every record (candidate, job, company, contact, application):
  a composer with inline @-mention autocomplete of workspace members, a note
  list with author and relative time, recent/oldest sort, and edit/delete of
  your own notes (admins any)
- @Mentions fan out to an in-app notification inbox: picking a member inserts
  "@Name" and notifies them on save (never yourself); removing the text before
  saving un-notifies them
- Workspace note templates seeded on first use (Screening call, Client
  submission, Interview feedback) with an "Insert template" composer picker
- Per-record Timeline: a merged, newest-first activity feed built from the
  existing audit log, the application status history, and notes - no earlier
  milestone code changed
- Notification bell in the header with a live unread count, a dropdown list,
  click-to-open the record, and mark-one / mark-all read
- Org-wide Activity feed at `/activity`, each row linking to its record
- New tables (`notes`, `note_mentions`, `notifications`, `note_templates`)
  with row-level security in their creation migration
- Tests: mention-in-body filtering and templates (unit); notes RLS isolation,
  mention-to-notification fan-out and notification read state (DB, CI)

## v0.6.0 - Milestone 5: Applications, Pipeline & Kanban (2026-08-14)

### Added

- Applications: the candidate-to-job junction (unique pair per workspace),
  with a coarse 7-stage pipeline (screening, submitted, interview, offered,
  hired, rejected, archived) and a finer, workspace-configurable status
  dictionary seeded with the 13 Zoho statuses we use, including the
  submitted / approved-by-client / rejected-by-client loop
- Kanban board with native drag-and-drop between stages (optimistic move with
  rollback), a global pipeline page with a job filter, a per-job board, and a
  read-only guard that shows the board but blocks moves
- Append-only application status history (from/to status and stage, actor,
  note) with time-in-stage on the cards and record; per-workspace human ids
  (APP-0001)
- Associate flows from either side (add a candidate to a job, add a job to a
  candidate) with duplicate pairs blocked; a trashed pair is restored rather
  than duplicated
- Application record with a status control (rejections capture a reason),
  owner and rating, and a transition timeline; real pipeline counts on the job
  record and an applications list on the candidate record
- New tables (`applications`, `application_statuses`,
  `application_status_history`) with row-level security in their creation
  migration; the status dictionary seeds lazily on first use
- Perf seed extended with 800 applications across the pipeline

### Changed

- EmergeTech brand foundation: two official brand colours (navy + teal)
  centralized as theme tokens, official logo and favicon, light theme as the
  default (dark still available), and brand-consistent buttons, links,
  navigation and badges

## v0.5.0 - Milestone 4: Jobs (2026-08-14)

### Added

- Jobs: CRUD for a role opened against a client company (company required)
  and routed to an account-manager owner, with an optional hiring contact
  that must belong to the chosen client
- Slim status lifecycle (open, on hold, filled, cancelled, inactive) with a
  quick status control on the record and an audit entry per change
- Employment type (permanent/contract/temporary), work mode
  (onsite/hybrid/remote), location, number of positions, opened and target
  close dates, long-form job description, free-text plus structured salary
  (min/max/currency/period)
- Per-workspace human ids (JOB-0001) via the shared counter
- Job list (search, sort, trash, status + client + owner columns) and a
  record page with inline editing, client and hiring-contact links, and a
  pipeline summary placeholder that Applications (M5) will fill
- New-job modal with a required client picker and a hiring-contact picker
  scoped to the selected client
- New `jobs` table (status/employment-type/work-mode enums) with row-level
  security in its creation migration
- Perf seed extended with 500 jobs
- Tests: job input validation and JOB human id (unit); RLS isolation, job
  counter, company foreign key, hiring-contact scoping and status change (DB)

## v0.4.0 - Milestone 3: Candidates, CV Upload & Dedupe (2026-08-14)

### Added

- Candidates: full profile CRUD (name, title, employer, primary/secondary
  email, phone/mobile, city/country, LinkedIn/website, skills, experience
  years, free-text + structured salary, notice period, source), sourcer owner,
  per-workspace human ids (CAND-0001), soft delete with a 30-day trash
- Candidate education and work-experience sub-records (1:N, add/remove),
  shaped to receive parsed CV data in a later milestone
- CV and document upload to S3-compatible storage (MinIO in dev): server-proxied
  multipart upload with MIME and 15 MB limits, presigned download, delete;
  the primary CV is stored as a `cv`-kind attachment
- Email duplicate detection on create (non-blocking warning) plus a merge tool
  that folds one candidate into another, preserving education, experience and
  attachments and soft-deleting the source
- CSV import wizard: upload, auto-mapped column mapping, dry-run preview with
  per-row errors, import with skip-or-update dedupe by email
- Candidate list (search, sort, trash, source and human-id columns) and a
  record page with inline profile editing, documents, experience and education
- New tables (`candidates`, `candidate_education`, `candidate_experience`,
  `attachments`, `counters`) with row-level security in their creation migration
- Perf seed extended with 10,000 candidates

## v0.3.0 - Milestone 2: Companies & Contacts (2026-08-14)

### Added

- Companies (clients): CRUD with website + normalized domain, industry, size,
  location, phone, description, status (prospect/active/dormant) and an
  account manager owner; field shape mirrors our Zoho Clients for 1:1 import
- Contacts: CRUD with primary/secondary email, work/mobile phone, job title,
  LinkedIn, per-company primary-contact flag (auto-demotes the previous one)
  and support for independent contacts with no company
- Tags schema (`tags` + polymorphic `taggings`, unique per workspace); tag
  management UI deliberately deferred
- Shared list engine: pagination (50 per page, capped at 200), whitelisted
  sorting, escaped case-insensitive search, trash filtering
- Reusable DataTable with server-driven sort/pagination and row navigation;
  list pages with debounced search and role-gated actions
- Record pages with inline field editing, owner selection from workspace
  members, linked-contacts panel and audit-logged mutations
- Duplicate detection on create (company name/domain, contact email):
  warns with links to the existing records, never blocks
- Soft delete with a 30-day trash view and one-click restore
- Row-level security policies on all four new tables in their creation migration
- Perf seed script (`pnpm --filter @emerge/db seed`): 1,000 companies +
  10,000 contacts in a throwaway workspace
- Tests: list-input validation and domain normalization (unit), RLS isolation,
  trash retention window and tag uniqueness for the new tables (DB, CI)
- Product docs: full Zoho Recruit audit, entity model, feature parity matrix,
  migration plan, and the revised M3-M19 roadmap

## v0.2.0 - Milestone 1: Auth, Workspaces, Users & Roles (2026-08-13)

### Added

- Email + password authentication: argon2id hashing, DB-backed sessions with
  hashed tokens (30-day expiry, httpOnly cookies), login, logout, signup with
  workspace creation
- Password reset flow: single-use hashed tokens (1 hour TTL), reset invalidates
  all existing sessions; emails delivered via the worker (BullMQ + SMTP/MailHog)
- Workspaces (tenants) with settings page (name, logo)
- Roles: admin, recruiter, read-only; role changes apply immediately;
  last-admin and self-deactivation guards
- Members management: invite by email (7-day single-use links), pending
  invitation list with revoke, role changes, deactivate/reactivate; invite
  acceptance for both new and existing accounts
- Postgres row-level security as the tenant isolation layer: `emerge_app`
  role + `app.workspace_id` transaction setting, `workspace_isolation`
  policies on all tenant tables; every workspace request runs inside an
  RLS-scoped transaction
- tRPC middleware stack: `protectedProcedure` (session), `workspaceProcedure`
  (RLS transaction + role, blocks writes for read-only), `adminProcedure`
- Audit log: auth and member management events recorded and visible to admins
  under Settings, workspace-scoped via RLS
- Auth UI: login, signup, forgot/reset password, accept-invite, profile
  settings, user menu with role badge
- Tests: permission matrix, RLS isolation, session lifecycle (vitest);
  full signup-invite-accept e2e journey (Playwright, runs in CI)

## v0.1.0 - Milestone 0: Project Foundation (2026-08-13)

### Added

- pnpm monorepo: `apps/web` (Next.js 15, React 19, tRPC 11, Tailwind 4),
  `apps/worker` (BullMQ heartbeat worker), `packages/db` (Drizzle ORM + migrations),
  `packages/core` (shared domain logic), `packages/ui` (shared UI utilities)
- Docker Compose stack: web, worker, PostgreSQL 16, Redis 7, MinIO, with healthchecks;
  one-command boot from `.env.example`
- CI (GitHub Actions): lint, format check, typecheck, unit tests, fresh-database
  migration check, production build, commitlint, Playwright e2e smoke, and a full
  Docker Compose smoke test against `/api/health`
- App shell: sidebar navigation, light/dark theme, dashboard, placeholder routes for
  Phase 1 modules
- `/api/health` endpoint reporting per-dependency status (db, redis, storage)
- tRPC scaffold with `health.ping`, wired to a live API status indicator in the UI
- Governance: branch protection, issue/PR templates, husky commit-msg hook,
  GitHub Milestones M0-M19, project docs (roadmap, 20 milestone specs, 8 ADRs)
