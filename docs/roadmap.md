# Development Roadmap

Product: modern open-source Recruitment CRM / ATS (agency-first).
Primary source of truth: the audit of our live Zoho Recruit instance
- now **`docs/audit/zoho-live-audit-2026-08-15.md`** (post-cutover, API + UI
verified), superseding the pre-cutover `zoho-recruit-audit.md`. Functional
reference: OpenCATS. Competitive bar: Zoho Recruit Staffing edition - functional
parity with what we actually use, modern UX, never a UI copy.

Every milestone produces a usable, testable increment and leaves the repository
in a stable, working state, and follows the same gate:

> **BUILD → TEST → VERIFY AGAINST ZOHO → COMPLETE.**
> No milestone is Done until its behaviour has been diffed against the live Zoho
> Recruit org (`recruit.zoho.eu`, org `20113116180`) and the differences are
> either matched or explicitly accepted in the milestone's "Zoho reference"
> section.

Each milestone has a full spec block in this file (Objective, Features,
Database/API, UI, Dependencies, Acceptance criteria, Zoho reference). The
roadmap table + these blocks are authoritative; the standalone files in
`docs/milestones/` are regenerated to match a block **when that milestone is
approved to start** (several are currently stale relative to this table - see
"Milestone file drift" below).

> **Revision history**
> - 13 Aug 2026 - full Zoho Recruit product audit. Resume parsing moved up;
>   dedicated Zoho migration milestone added.
> - 14 Aug 2026 - Zoho migration engine pulled ahead of parsing, shipped as
>   **v0.8.0**; parsing becomes **v0.9.0**.
> - **15 Aug 2026 - post-cutover live audit** (`zoho-live-audit-2026-08-15.md`).
>   Data is now IN Emerge (86 companies / 12 contacts / 1,298 candidates /
>   101 jobs / 763 applications / 1,218 notes). This revision (a) reconciles
>   every audited gap to a specific milestone (see §"Audit gap → milestone
>   traceability"), (b) adds full 7-field spec blocks for M7+, (c) adds the
>   **attachment (CV) backfill** as a discrete near-term data task, (d) keeps
>   M0–M6 + M8 frozen. No completed milestone's scope is changed.

## Versioning

Semantic versioning. Each completed milestone bumps the minor version and gets a
git tag + GitHub release. `v1.0.0` ships at Milestone 19.

## Phases

- **Phase 1 - Core desk + switch-over (M0–M9):** the objects and workflows our
  team uses daily in Zoho, ending with migration (done) + parsing + search. At
  the end of Phase 1 the agency lives in Emerge as its daily ATS.
- **Phase 2 - Client workflow & recruiting depth (M10–M14):** first-class client
  sendouts, interviews, offers/placements, email, agency analytics.
- **Phase 3 - Intelligence & platform (M15–M19):** AI matching, public surfaces,
  API, compliance, hardening, v1.0.

## Milestone overview

| #   | Milestone                                          | Version | Status  | Depends on | Complexity | Audit gaps closed |
| --- | -------------------------------------------------- | ------- | ------- | ---------- | ---------- | ----------------- |
| M0  | Project Foundation                                 | v0.1.0  | Done    | –          | M          | –                 |
| M1  | Auth, Workspaces, Users & Roles                    | v0.2.0  | Done    | M0         | L          | platform          |
| M2  | Companies & Contacts                               | v0.3.0  | Done    | M1         | M          | core              |
| M3  | Candidates, CV Upload & Dedupe                     | v0.4.0  | Done    | M1         | L          | core              |
| M4  | Jobs (client-owned, AM-routed)                     | v0.5.0  | Done    | M2         | M          | core              |
| M5  | Applications: Pipeline, Statuses & Kanban          | v0.6.0  | Done    | M3, M4     | L          | core              |
| M6  | Notes, @Mentions, Timeline & Notifications         | v0.7.0  | Done    | M2–M5      | L          | collaboration     |
| M8  | Zoho Migration & Import Engine                     | v0.8.0  | Done    | M2–M6      | L          | migration         |
| -   | **Attachment (CV) backfill** (engine phase + data run) | –     | **Next**| M8         | S          | **H2**            |
| M7  | Resume Parsing & Bulk CV Intake                    | v0.9.0  | Planned | M3         | L          | **H6**, M-parse   |
| M9  | Global Search, Filters, Saved Views & Bulk Actions | v0.10.0 | Planned | M2–M5      | L          | **H3**, M2, M-tags |
| M10 | Client Submissions & Feedback                      | v0.11.0 | Planned | M5, M6     | M          | **H8**, submissions |
| M11 | Interviews & Tasks (lite)                          | v0.12.0 | Planned | M5, M6     | M          | **H1**, Reviews-lite, To-Dos-lite |
| M12 | Offers, Placements & Job Revenue                   | v0.13.0 | Planned | M5         | M          | **H7**, Forecasts |
| M13 | Email Integration                                  | v0.14.0 | Planned | M6         | L          | **H4**, Mail-merge |
| M14 | Agency Reports & Analytics                         | v0.15.0 | Planned | M5, M10    | M          | Reports/Dashboards/Metrics |
| M15 | Candidate Matching & Semantic Search               | v0.16.0 | Planned | M7, M9     | L          | Zia matching      |
| M16 | Public API, Webhooks & Career Page                 | v0.17.0 | Planned | M9         | L          | **H5**, career site, job boards |
| M17 | Compliance: GDPR, Blocklist & Data Tools           | v0.18.0 | Planned | M8         | M          | Compliance/GDPR   |
| M18 | Security, Performance & Production Hardening       | v0.19.0 | Planned | all        | L          | platform          |
| M19 | v1.0 Production Release                            | v1.0.0  | Planned | M18        | M          | –                 |

Complexity scale: S (days), M (about a week), L (1–2 weeks), XL (2–3 weeks).
Estimates assume one primary developer + AI tooling.

---

## Audit gap → milestone traceability

Every gap from `zoho-live-audit-2026-08-15.md` §2 is assigned to exactly one
milestone (or explicitly deferred). Nothing is orphaned.

### HIGH (blocks daily use)

| Audit ID | Gap | Milestone |
| -------- | --- | --------- |
| H1 | Interviews module (schedule/list/feedback/status FSM) | **M11** |
| H2 | Candidate CV attachments → download (1,293 files) | **Attachment backfill** (data task, before M7) |
| H3 | Global search across modules | **M9** |
| H4 | Send email from a record | **M13** |
| H5 | Career site + web-to-candidate form | **M16** (behind toggle; MEDIUM in practice - no CareerSite records exist) |
| H6 | Resume parser + Resume Inbox | **M7** (parser); Resume Inbox → post-1.0 |
| H7 | Multi-status offer flow (made/accepted/withdrawn + expiry) | **M12** |
| H8 | Client sees "submitted" candidates (review/approve/reject) | **M10** via tokened share links (full contact *login* portal → post-1.0) |

### MEDIUM

| Audit ID | Gap | Milestone |
| -------- | --- | --------- |
| M1 | Tags (composer + filter chips) | **M9** (schema already shipped in M2) |
| M2 | Custom/saved views per module | **M9** |
| M3 | Custom fields UI | post-1.0 (jsonb reserved; 0 custom fields in Zoho) |
| M4 | Page layouts per profile | post-1.0 (all Zoho layouts default) |
| M5 | Assessments (question bank + scoring) | post-1.0 (4 templates, 0 answers in Zoho) |
| M6 | Reviews (recruiter/interviewer/client) | **M11** feedback covers the used part; full module post-1.0 |
| M7 (audit) | Approval process (multi-step) | post-1.0 (0 approval records in Zoho) |
| M8 (audit) | Blueprint (generic status FSM) | **M5** stage-map already covers it; generalise post-1.0 |
| M9 (audit) | Mail merge (bulk personalised email) | **M13** (rides on email) |
| M10 (audit) | Job publishing to career site + boards | **M16** |
| M11 (audit) | Formatted / branded resume | post-1.0 |
| M12 (audit) | Calendar booking (self-book link) | post-1.0 (interview scheduling lands in M11) |
| M13 (audit) | Zia matching (AI candidate↔job) | **M15** |
| M14 (audit) | Reports + dashboards module | **M14** |
| M15 (audit) | Forecasts (revenue from placements) | **M12** |
| M16 (audit) | Candidate portal | post-1.0 |
| M17 (audit) | Vendor portal | post-1.0 |
| M18 (audit) | Compliance / GDPR module | **M17** |
| M19 (audit) | Sandbox | N/A (dev + staging DBs already exist) |
| M20 (audit) | Custom buttons / functions (Deluge) | post-1.0 (replace with our webhook + automation engine) |
| M21 (audit) | Marketplace extensions | N/A |

### LOW (Zoho ships it, zero data in our org - deliberately not built)

Campaigns, To-Dos as full module (Tasks-lite lands in M11), SMS/telephony,
social publishing, job-board multiposting (unless M16), territories, Recruiter
Inbox, video-interview providers, convert-as-employee/temp. All listed under
**Post-1.0 backlog / Not copied**.

---

## Completed milestones (frozen - scope unchanged)

- **M0 Foundation (v0.1.0):** monorepo, CI, DB migration harness, RLS pattern.
- **M1 Auth/Users/Roles (v0.2.0):** argon2id + DB sessions, workspaces,
  memberships, invitations, 3 roles (admin/recruiter/readonly), audit_log.
- **M2 Companies & Contacts (v0.3.0):** Zoho-parity Clients/Contacts, owner =
  account manager, tags schema (UI deferred).
- **M3 Candidates (v0.4.0):** candidate CRUD + education/experience sub-records,
  unique-email dedupe + merge prompt, CV attachment upload (MinIO), CAND-nnnn
  ids, source tracking, basic CSV import.
- **M4 Jobs (v0.5.0):** job CRUD, company REQUIRED + optional hiring contact, AM
  owner, 5-status set, rich-text JD, salary text + range, location/remote.
- **M5 Applications (v0.6.0):** candidate×job unique pair, 7-stage + 30-value
  status dictionary seeded from live Zoho, status history, kanban per job +
  global, read-only guards. **Benchmark:** Porsche Consulting → 38 applications.
- **M6 Notes & Timeline (v0.7.0):** polymorphic notes, @mentions → in-app
  notifications, note templates, per-record timeline (reads audit_log + status
  history + notes), org-wide activity feed.
- **M8 Zoho Migration Engine (v0.8.0):** external_refs idempotency, import_runs
  + import_records ledger, per-entity RLS tx + bulk insert, dry-run/import/delta,
  rollback, verify. Exit criterion met - full dataset live with relationships
  intact.

**M1–M5 tables are off-limits** to every milestone below (users, memberships,
invitations, sessions, password_reset_tokens, companies, contacts, tags,
taggings, candidates, candidate_education, candidate_experience, attachments,
counters, jobs, applications, application_statuses, application_status_history).
New milestones only *add* tables/routers.

---

## Near-term data task - Attachment (CV) backfill

**Not a versioned milestone, but it IS a code build.** Correction (15 Aug, on
inspection): the *display* side already exists from M3 (`attachments` table,
presigned download, `candidate-documents.tsx`), but the migration engine has
**no attachment phase** - it only reads offline JSONL snapshots, which carry
metadata, not file bytes. So this task = build a live-Zoho attachment fetcher in
`packages/migration` + run it. (An earlier draft wrongly called this "already
coded".)

- **Objective:** get all Zoho candidate CVs into MinIO so recruiters can
  download a CV from a candidate record.
- **Work:** (a) build `zoho.ts` (OAuth refresh-token client: list + download
  attachments), `s3.ts` (MinIO put), `attachments.ts` (phase: resolve candidate
  via external_refs → list → download → upload → insert attachments row +
  external_ref + import_record, resumable + idempotent), and an `attachments`
  CLI subcommand + tests. (b) run it against the production workspace. ~1,293
  candidate files. Object key `workspaces/<ws>/candidates/<id>/zoho-<att>-<name>`.
  **Needs live Zoho API OAuth creds** (the MCP cannot download bytes).
- **Verify against Zoho:** `files stored == Is_Attachment_Present count`, each
  with matching size/checksum; spot-check 10 CVs open correctly; the benchmark
  Porsche chain's candidates all have a downloadable CV.
- **Acceptance:** attachment count reconciles in the verification report; 0
  failed downloads on the sample; re-run is idempotent (skips stored files).
- **Zoho reference:** candidate record → Attachments panel → Resume/CV file.

---

# M6+ milestone specifications

Each block: **Objective · Features · Database/API · UI · Dependencies ·
Acceptance criteria (incl. the Zoho-verify gate) · Zoho reference functionality.**

## M7 - Resume Parsing & Bulk CV Intake  ·  v0.9.0  ·  depends M3

**Objective.** Restore the agency's #1 candidate intake path: drop a CV (or a
folder of CVs) and get a reviewed candidate with education/experience and the CV
attached. Closes audit **H6** (1,034 of 1,298 Zoho candidates arrived via
parser - without this the team hand-types everyone).

**Features.**
- Single + bulk CV upload (drag-drop, multi-file, folder).
- Parse worker → candidate fields + `candidate_education` + `candidate_experience`
  + CV stored as `attachments.kind=cv`.
- Review/confirm screen before the candidate is created (edit parsed fields).
- Dedupe check against existing lowercased email on confirm (merge prompt reuses
  M3 dedupe).
- Parse-failure triage list (couldn't-parse queue with re-try / manual entry).
- Source auto-set to `parser`.

**Database/API.** New: `parse_jobs` (upload → queued → parsed → confirmed/failed,
raw + parsed jsonb, sha256). tRPC `parsing.{upload, list, get, confirm, retry,
discard}`. BullMQ queue + parser worker (evaluate a hosted parser vs self-host
against the real DACH/EU CV mix; ADR required). No change to `candidates`/
`attachments` schema (reuse).

**UI.** Drop-zone page, bulk progress list, per-CV review form, triage queue.

**Dependencies.** M3 (candidate + attachment + dedupe model). Independent of M8.

**Acceptance criteria.**
1. Single PDF/DOCX → candidate created with name/email/phone + ≥1 education +
   ≥1 experience row + CV downloadable.
2. Bulk of 25 mixed CVs processes with a progress UI; failures land in triage,
   not lost.
3. Confirm step blocks a duplicate email with a merge prompt.
4. **Verify against Zoho:** parse the same 20 real CVs Zoho parsed; field-level
   extraction is ≥ Zoho's on name/email/phone/current-title and captures
   education/experience rows Zoho captured. Gaps documented + accepted.

**Zoho reference.** Import Resume / Resume Parser Mapping / Resume Inbox
(`Import_Resume`, `Parser_Mapping`, `ResumeInbox`); timeline "Imported with
Parser" (3), "Screening Failed" (121). Resume Inbox (email-in) → post-1.0.

## M9 - Global Search, Filters, Saved Views & Bulk Actions  ·  v0.10.0  ·  depends M2–M5

**Objective.** Make the switched-over team able to *find* anything at 1,300+
candidates. Closes audit **H3** (global search), **M2** (custom views), and the
**Tags UI** (M1) that has schema but no surface.

**Features.**
- Global command-palette search (Cmd/Ctrl-K) across candidates, jobs, companies,
  contacts, applications.
- Per-list quick filters + a criteria builder (field/operator/value, AND/OR).
- Saved views (per user + shareable): filters + visible columns + sort.
- Column visibility + ordering per list.
- Bulk select + actions: status change, owner change, tag/untag, delete
  (guarded), CSV export.
- **Tags UI:** tag composer + filter chips on candidates/jobs/companies/contacts
  (reuses `tags` + `taggings` from M2).

**Database/API.** New: `saved_views` (workspace, user, module, filters jsonb,
columns jsonb, is_shared). Postgres tsvector/trigram indexes on the 5 searched
tables. tRPC `search.global`, `views.{list,save,update,delete}`, bulk endpoints
per module, `export.csv`. No M1–M5 table change (indexes are additive).

**UI.** Command palette, filter bar + builder dialog, view switcher, column
picker, bulk toolbar, tag chips.

**Dependencies.** M2–M5 (the objects being searched).

**Acceptance criteria.**
1. Cmd-K finds a candidate by name/email, a job by title, a client by name in
   < 300 ms on the real dataset.
2. A saved view restores exact filters + columns + sort; a shared view is
   visible to teammates.
3. Bulk owner-change on 50 applications writes 50 timeline events and respects
   read-only role.
4. **Verify against Zoho:** the three default Zoho views recruiters rely on
   ("My Open Candidates", "This week's submissions", "Open Jobs by AM")
   reproduce as saved views with matching row counts.

**Zoho reference.** Global search bar + advanced-search revamp; Custom Views
(`Manage_CustomViews`); Tags (`Tags`, `Associate_Tags`); Mass Update/Transfer/
Delete + Export permissions. Custom-fields UI stays post-1.0 (0 custom fields).

## M10 - Client Submissions & Feedback  ·  v0.11.0  ·  depends M5, M6

**Objective.** Make "send candidates to the client and get a verdict" a
first-class record, not an email. Closes audit **H8** - the client can review,
approve, reject, and comment on submitted candidates **via a tokened share
link** (no client login; full contact-login portal is post-1.0).

**Features.**
- Submission record layered on the M5 "Submitted-to-client" status: who sent
  which candidate(s) to which client contact, when, via what medium.
- Submission history per job and per client.
- Tokened, no-login client share page: client sees the submitted candidate(s)
  (+ formatted profile + CV) and can Approve / Reject (with reason) / comment.
- Auto status sync: client verdict → application status (`approved_by_client` /
  `rejected_by_client`) + timeline event + notification to the sourcer/AM.
- Bulk submission (multiple candidates for one job in one send).

**Database/API.** New: `submissions` (workspace, application_id, job_id,
company_id, contact_id, status, medium, sent_by, sent_at, token_hash,
client_comment, verdict_at). tRPC `submissions.{create, list, byJob, byClient,
verdict(public-token)}`. Public token route (rate-limited, no session). Reuses
M5 status machine + M6 notifications.

**UI.** "Submit to client" dialog from the kanban/application, submission log on
job + client records, the public share page, verdict banner on the application.

**Dependencies.** M5 (statuses), M6 (notifications/timeline). Email (M13) not
required - link is shareable manually until then.

**Acceptance criteria.**
1. Submitting 3 candidates for a job creates 3 submission records + moves the
   applications to `submitted_to_client`.
2. Opening the tokened link (no login) shows exactly the submitted candidate(s)
   and their CV; Approve/Reject writes back the application status within the
   request.
3. A revoked/expired token 404s.
4. **Verify against Zoho:** the flow reproduces Zoho's "Submit to Client" +
   `Submission_Status` (Submitted/Approved/Rejected/Archived) transitions and
   the "Submitted To Client" (37) / "Bulk Client Submission" (36) timeline
   semantics.

**Zoho reference.** Submit to Client (`Submit_To_Client`), Submissions module
(18 fields, `Submission_Status`/`Submission_Medium`), Client Portal review flow
(the login version → post-1.0), timeline 36/37/259.

## M11 - Interviews & Tasks (lite)  ·  v0.12.0  ·  depends M5, M6

**Objective.** Manage the interview stage in-product instead of inboxes. Closes
audit **H1** (Interviews module) and the *used* part of **Reviews (M6)** via
interview feedback; ships a minimal **Tasks (To-Dos-lite)**.

**Features.**
- Interview record on an application: type (screen/L1–L4/client/final), datetime
  + duration, location/meeting link, interviewers (internal users + external
  client contacts), status FSM (scheduled/completed/cancelled/no-show).
- Feedback/scorecard: per-interviewer rating (1–5) + recommendation
  (strong-yes/yes/no/strong-no) + comments; aggregate on the application.
- Reminders + timeline: scheduled/completed/cancelled events on the application
  timeline; "My Interviews" day/week list.
- ICS invite via SMTP when no calendar is connected (calendar OAuth two-way sync
  deferred to a later pass - keep this milestone M-sized).
- Tasks-lite: simple task with subject/due-date/assignee/status on any record
  (Zoho To-Dos are 0-data, so keep it minimal).

**Database/API.** New: `interviews`, `interview_participants`,
`interview_feedback`, `tasks`. Status FSM mirrors Zoho `Interview_Status`
blueprint. tRPC `interviews.{schedule,update,cancel,reschedule,list,
byApplication}`, `interviewFeedback.*`, `tasks.*`. ICS generation.

**UI.** Schedule dialog, interview cards on application + timeline, feedback
form, My Interviews view, task list on records + a My Tasks view.

**Dependencies.** M5 (applications), M6 (events/notifications). SMTP (M13) not
required for ICS.

**Acceptance criteria.**
1. Schedule an interview with an internal user + a client contact; both receive
   an ICS invite importable into Google/Outlook.
2. Two interviewers' feedback renders an aggregate; feedback immutable after a
   15-min edit window.
3. Cancelling sets status=cancelled + timeline event; no-show captured.
4. A task with a due date shows on the record and in My Tasks.
5. **Verify against Zoho:** interview types, `Interview_Status` transitions,
   `Cancellation_Reason`/`Rejection_Reason` reasons, and `Reminder` options
   match Zoho's Interviews module fields (§1.2 of the audit).

**Zoho reference.** Interviews module (30 fields, blueprint `Interview_Status`,
Meeting_Provider, Interviewer/Reviewed_By contacts, feedback); Reviews module
(feedback subset); To-Dos (Tasks). Video providers + calendar-booking →
post-1.0.

## M12 - Offers, Placements & Job Revenue  ·  v0.13.0  ·  depends M5

**Objective.** Close the loop from offer to placement to fee - how an agency
measures itself. Closes audit **H7** (offer flow) and **Forecasts (M15)**
(revenue preserved in `custom_fields.zoho.revenue.*`).

**Features.**
- Offer lifecycle on the application: draft → sent → accepted/declined/withdrawn,
  with expiry + resend; offer letter from a template; salary/start-date.
- Placement record on hire: start date, fee/revenue actuals, placed-by.
- Job revenue summary: expected (Revenue_per_Position × positions) vs actual
  (from placements) per job, per client, per AM.

**Database/API.** New: `offers` (application_id, status, sent_at, expires_at,
accepted_at, declined_at, letter_html, salary_amount, currency, start_date,
medium), `offer_status_history`, `placements` (application_id, start_date,
fee_amount, currency, placed_by). Expiry cron (BullMQ). tRPC `offers.*`,
`placements.*`, `revenue.summary`.

**UI.** "Generate offer" from the kanban, offer status banner + countdown,
placement form on hire, revenue panel on job/client records.

**Dependencies.** M5 (applications). M13 email optional (send offer by link
until then).

**Acceptance criteria.**
1. Create → send → accept an offer moves the application to `offer_accepted`;
   withdraw → `offer_withdrawn`; expiry cron auto-flags overdue offers.
2. Marking hired creates a placement with fee; revenue summary rolls up per job
   and per AM.
3. **Verify against Zoho:** offer statuses (Made/Accepted/Declined/Withdrawn) +
   the 14 offer timeline activities (135–145, 401–404) and the job revenue
   fields (Revenue_per_Position/Expected/Actual/Missed) are represented.

**Zoho reference.** Offers flow (timeline 135–145, 401–404, `Generate Offer`,
`Send Offer Mail`, expiry), Job_Openings revenue block, Forecasts tab.

## M13 - Email Integration  ·  v0.14.0  ·  depends M6

**Objective.** Send email from a record and log it - the daily comms channel.
Closes audit **H4** (send email) and **Mail merge (M9-audit)**.

**Features.**
- Outbound send from candidate/application/submission via SMTP (Resend already
  wired) with templates + merge fields.
- Log every send to the record timeline + `Last_Mailed_Time`-equivalent.
- Mail merge: pick a template + a set of records → personalised bulk send.
- Inbound reply capture via Resend Inbound webhook (thread by Reply-To token);
  full two-way mailbox sync → post-1.0.

**Database/API.** New: `emails` (entity_type, entity_id, direction, from, to[],
cc[], subject, body_html, message_id, provider_id, sent_at, opened_at,
replied_at), `email_templates`. tRPC `emails.{send, list, byRecord}`,
`emailTemplates.*`, inbound webhook route.

**UI.** Email composer + template picker (Communication tab on records), thread
list, mail-merge wizard, template manager.

**Dependencies.** M6 (timeline). SMTP/Resend (already configured in prod).

**Acceptance criteria.**
1. Send from a candidate record; email arrives; a timeline entry + `emails` row
   is written.
2. Mail merge to 10 candidates personalises each and logs 10 sends.
3. A reply lands against the originating record via the webhook.
4. **Verify against Zoho:** matches Zoho's Send Email + Mail Merge + email
   timeline (8/462/463) and the per-module `Last_Mailed_Time` behaviour.

**Zoho reference.** Send Email (`Individual_Mail`), Mass Email, Mail Merge
(`Mail_Merge`), Zoho Mail/IMAP integration, `Last_Mailed_Time` field. Two-way
sync + Resume Inbox → post-1.0.

## M14 - Agency Reports & Analytics  ·  v0.15.0  ·  depends M5, M10

**Objective.** The KPIs the data begs for. Closes the audit **Reports /
Dashboards / Metrics / Analytics** tab gap with a scoped, agency-first report
surface (not a generic report builder in v1).

**Features.**
- Baseline reports: submissions per sourcer per week; pipeline funnel +
  conversion; time-in-stage; time-to-first-submission; client health (jobs open,
  last submission); AM/sourcer leaderboards.
- Dashboard page assembling the above as cards.
- Scheduled email delivery of a report (reuses M13).
- CSV export per report.

**Database/API.** Mostly read-side: SQL aggregates over
`application_status_history` + `submissions` + `placements`. New: `report_schedules`.
tRPC `reports.{funnel, submissionsBySourcer, timeInStage, clientHealth,
leaderboard}`, `reportSchedules.*`. No M1–M5 change.

**UI.** Reports/dashboard page with date + user + client filters; chart cards;
schedule dialog.

**Dependencies.** M5 (status history) + M10 (submissions) must emit clean events
- both already do.

**Acceptance criteria.**
1. Funnel report totals reconcile with the kanban counts for a date range.
2. Submissions-per-sourcer matches the submission log for the same window.
3. A scheduled report emails a CSV on time.
4. **Verify against Zoho:** the five reports reproduce the numbers Zoho's home
   tiles + a matching Zoho report show for the same window.

**Zoho reference.** Reports + Dashboards + Metrics modules, Forecasts,
`Manage_Reports_Dashboards` + `Schedule_Reports`. Full custom-report builder →
post-1.0.

## M15 - Candidate Matching & Semantic Search  ·  v0.16.0  ·  depends M7, M9

**Objective.** "Find candidates for this job" / "find jobs for this candidate"
over the real 1,300+ corpus. Closes audit **Zia matching (M13-audit)**.

**Features.**
- Embeddings for candidates (skills + experience) and jobs (JD + requirements).
- Match panels: top candidates for a job, top jobs for a candidate, with a score.
- Semantic skill search alongside the M9 keyword search.

**Database/API.** pgvector columns/table (`candidate_embeddings`,
`job_embeddings`), embed worker (batch + on-write). tRPC `matching.{forJob,
forCandidate}`, `search.semantic`.

**UI.** Match panel on job + candidate records; a "semantic" toggle in M9 search.

**Dependencies.** M7 (structured candidate data), M9 (search surface),
post-migration corpus (done).

**Acceptance criteria.**
1. For a real job, the top-10 matches are recruiter-plausible (spot-check with
   Sam/Michelle).
2. Semantic search for a skill returns candidates whose CV implies it without
   the exact keyword.
3. **Verify against Zoho:** results are compared against Zoho Zia's
   `getZiaMatchingCandidates` for the same job; parity or better on the sample.

**Zoho reference.** Zia matching (`getZiaMatchingCandidates/JobOpenings` +
refine), Data Enriched (306).

## M16 - Public API, Webhooks & Career Page  ·  v0.17.0  ·  depends M9

**Objective.** Open the platform + (optionally) the public candidate-acquisition
surface. Closes audit **H5** (career site + web-to-candidate) and **M10-audit**
(job publishing) - both behind a per-workspace toggle, off by default (0
CareerSite records in the live org).

**Features.**
- Versioned public REST API + API keys/scopes.
- Outbound webhooks (record events → subscriber URLs) - our replacement for
  Zoho custom functions/buttons.
- Optional public careers page + apply form (web-to-candidate) → creates a
  candidate + application with source=`careersite`.

**Database/API.** New: `api_keys`, `webhook_subscriptions`, `webhook_deliveries`,
`public_job_postings`. Public REST layer (separate from tRPC), webhook
dispatcher worker. Apply-form endpoint (rate-limited, captcha).

**UI.** API-keys + webhooks settings; careers page theme + per-job publish
toggle; apply form.

**Dependencies.** M9 (stable object model + search). Email (M13) for apply
confirmations.

**Acceptance criteria.**
1. An API key can read candidates/jobs within scope + RLS; revoked key 401s.
2. A webhook fires on application status change and retries on failure.
3. A public apply submission creates a candidate + application; appears in the
   pipeline.
4. **Verify against Zoho:** apply-form → candidate mirrors Zoho Web-to-Candidate
   + CareerSite source; publish toggle mirrors `Publish`/`Keep_on_Career_Site`.

**Zoho reference.** Zoho Recruit API, Web-to-Candidate/Contact, Career Site,
Job Boards (`JobBoards_Free/Paid`), custom functions/webhooks. Paid job-board
multiposting → post-1.0.

## M17 - Compliance: GDPR, Blocklist & Data Tools  ·  v0.18.0  ·  depends M8

**Objective.** UK/EU compliance the agency needs. Closes audit **Compliance /
GDPR (M18-audit)** and surfaces the blocklist/opt-out flags already imported.

**Features.**
- Per-candidate GDPR export + right-to-erase (hard delete + audit).
- Consent capture + email opt-out enforcement (blocks M13 sends).
- Blocklist (`Is_Blocked` imported) enforced across association/submission.
- Retention policy + optional auto-delete; workspace data export.

**Database/API.** New: `consent_records`, `retention_policies`. Reuses imported
`custom_fields.zoho.Is_Blocked` + `Email_Opt_Out`. tRPC `compliance.{export,
erase, consent, blocklist}`. Erase respects external_refs/audit.

**UI.** Compliance tab on candidate, workspace compliance settings, blocklist
badge, export/erase actions.

**Dependencies.** M8 (imported flags), M13 (opt-out enforcement point).

**Acceptance criteria.**
1. GDPR export produces a complete per-candidate package; erase removes the
   candidate + children + files and logs it.
2. An opted-out candidate cannot be emailed; a blocked candidate cannot be
   submitted.
3. **Verify against Zoho:** mirrors Zoho GDPR activities (133/134/207), Is_Blocked
   lock semantics (`Lock_Status`), and Email_Opt_Out behaviour.

**Zoho reference.** Manage Compliance + Compliance Reports/Metrics, GDPR timeline
(133/134/207), Is_Blocked/Lock_Status, Email_Opt_Out, Unsubscribe form.

## M18 - Security, Performance & Production Hardening  ·  v0.19.0  ·  depends all

**Objective.** Make it safe + fast at real scale before v1.

**Features.** Security review pass (authz on every route, RLS proofs, rate
limits), performance budget on 10k+ datasets, backup/restore drills (runbooks
already exist), observability (health checks live; add metrics/traces),
dependency + secret audit.

**Database/API.** Indexes/query tuning as found; no new domain tables. Add
rate-limit + audit middleware coverage.

**UI.** No new features; fix anything the perf/security pass surfaces.

**Dependencies.** Everything shipped.

**Acceptance criteria.**
1. Load test: list + search + kanban stay within budget at 10k candidates.
2. A restore drill from the R2/pg backup succeeds into a scratch DB.
3. Security checklist passes (no unauthorized route, RLS holds under adversarial
   tests).
4. **Verify against Zoho:** N/A (internal quality gate) - instead, a full
   regression pass confirms M1–M17 still match their Zoho-reference behaviour.

**Zoho reference.** N/A (platform hardening).

## M19 - v1.0 Production Release  ·  v1.0.0  ·  depends M18

**Objective.** Ship 1.0: docs site, self-host guide (Docker), demo seed, upgrade
path, release.

**Features.** Documentation site, Docker self-host guide, demo/seed dataset,
upgrade/migration path notes, release + announcement.

**Database/API.** Seed/demo tooling only.

**UI.** Docs/marketing surfaces; polish pass.

**Dependencies.** M18.

**Acceptance criteria.** Fresh self-host from the guide comes up healthy;
demo seed loads; upgrade path documented; `v1.0.0` tagged + released.

**Zoho reference.** N/A.

---

## Milestone file drift (to fix at start-of-milestone)

The standalone specs in `docs/milestones/` predate the 15 Aug renumbering and no
longer match this table. When a milestone is approved to start, regenerate its
file from the block above and delete/rename the stale one:

| Roadmap (authoritative) | Stale file to replace |
| ----------------------- | --------------------- |
| M7 Resume Parsing | `m07-parsing-documents.md` (close) |
| M8 Migration (done) | `m08-zoho-migration.md` (correct) - delete `m08-search-views-custom-fields.md` |
| M9 Search/Views | `m08-search-views-custom-fields.md` → `m09-...` |
| M10 Client Submissions | *(no file yet)* |
| M11 Interviews & Tasks | `m10-interviews-scheduling.md` → `m11-...` |
| M12 Offers/Placements | `m11-offers-placements.md` → `m12-...` |
| M13 Email | `m12-email.md` → `m13-...` |
| M14 Reports | `m15-reports-analytics.md` → `m14-...` |
| M15 Matching | `m13-matching.md` → `m15-...` |
| M16 API/Webhooks/Career | `m17-api-integrations.md` + `m09-career-portal.md` → `m16-...` |
| M17 Compliance | *(new)* |
| M18 Hardening | `m18-hardening.md` (correct number) |
| M19 v1.0 | `m19-v1-release.md` (correct number) |
| - automation (M14 old) | `m14-automation.md` → post-1.0 backlog |
| - candidate portal (M16 old) | `m16-candidate-portal.md` → post-1.0 backlog |

## Post-1.0 backlog (deliberately out of v1.0)

Candidate portal; client-contact login portal (tokened links cover v1);
vendor portal; automation rules / sequences / Blueprint-style generic FSM;
assessments & questionnaires with auto-scoring; full Reviews module; approval
processes; custom fields UI (jsonb reserved); page layouts per profile;
formatted/branded CV generator; resume inbox (email-in); two-way email sync;
calendar-booking self-scheduling; job-board multiposting; video-interview
providers; SMS/WhatsApp/CTI telephony; social publishing; campaigns; Chrome
sourcing extension; temp/contract back office; native mobile; granular
permission profiles; parent-company hierarchies; custom buttons/Deluge functions
(replaced by our API + webhooks).

## Features we deliberately do NOT copy

Candidate-level dual status+stage (one pipeline, on the application);
denormalized mirror fields on applications (joins instead); interviews-as-picklist
rounds with native video; the Submissions/Reviews/Assessments triple-module
overlap (one path: statuses → M10 submissions → M11 feedback); Campaigns module;
124-value industry picklist (curated short list + free text); fax fields;
territories; convert-as-employee/temp (no HRIS handoff).

## Release process per milestone

1. All acceptance criteria pass **including the "Verify against Zoho" gate.**
2. Tests, lint, production build pass in CI.
3. Docs updated (this file's status column + the regenerated milestone spec +
   the feature-parity matrix row).
4. `release/vX.Y.0` branch → final checks → merge to `main`.
5. Tag `vX.Y.0`, create GitHub release "Milestone N - <name>".
6. Merge back to `develop`, open next milestone.

See [development.md](development.md) for the full workflow.
