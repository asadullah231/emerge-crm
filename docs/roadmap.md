# Development Roadmap

Product: modern open-source Recruitment CRM / ATS (agency-first).
Primary source of truth: the audit of our live Zoho Recruit instance
(docs/audit/zoho-recruit-audit.md). Functional reference: OpenCATS.
Competitive bar: Zoho Recruit Staffing edition - functional parity with what we
actually use, modern UX, never a UI copy.

Every milestone produces a usable, testable increment and leaves the repository in
a stable, working state. Each milestone has a full spec in `docs/milestones/`
(Objective, Features, Database/Backend/Frontend/API changes, Migration
requirements, Acceptance criteria, Testing, Definition of Done). Specs for future
milestones are rewritten to match this roadmap when the milestone is approved to
start - the roadmap table is authoritative in between.

> Revised 13 Aug 2026 after the full Zoho Recruit product audit. M0-M2 history is
> unchanged. Key shifts: resume parsing moved up (it is our #1 intake), a
> dedicated Zoho migration milestone added (Phase 1 now ends with switch-over),
> career/candidate portals and automation moved out of the critical path,
> interviews slimmed to scheduling + outcomes, client sendouts made first-class
> in Phase 2.
>
> Revised 14 Aug 2026: on Asad's direction, the Zoho migration engine was
> pulled ahead of Resume Parsing and shipped as **v0.8.0**; Resume Parsing
> becomes **v0.9.0**. The switch-over risk (1,296 candidates + 762
> applications + 1,218 notes) was judged bigger than the intake risk.

## Versioning

Semantic versioning. Each completed milestone bumps the minor version and gets a
git tag + GitHub release. `v1.0.0` ships at Milestone 19.

## Phases

- **Phase 1 - Core desk + switch-over (M0-M9):** the objects and workflows our
  team uses daily in Zoho, ending with the Zoho migration engine and search.
  At the end of Phase 1 the agency switches to Emerge as its daily ATS.
- **Phase 2 - Client workflow & recruiting depth (M10-M14):** first-class client
  sendouts, interviews, offers/placements, email, agency analytics.
- **Phase 3 - Intelligence & platform (M15-M19):** AI matching, public surfaces,
  API, hardening, v1.0.

## Milestone overview

| #   | Milestone                                          | Version | Status  | Depends on | Complexity |
| --- | -------------------------------------------------- | ------- | ------- | ---------- | ---------- |
| M0  | Project Foundation                                 | v0.1.0  | Done    | -          | M          |
| M1  | Auth, Workspaces, Users & Roles                    | v0.2.0  | Done    | M0         | L          |
| M2  | Companies & Contacts                               | v0.3.0  | Done    | M1         | M          |
| M3  | Candidates, CV Upload & Dedupe                     | v0.4.0  | Done    | M1         | L          |
| M4  | Jobs (client-owned, AM-routed)                     | v0.5.0  | Done    | M2         | M          |
| M5  | Applications: Pipeline, Statuses & Kanban          | v0.6.0  | Done    | M3, M4     | L          |
| M6  | Notes, @Mentions, Timeline & Notifications         | v0.7.0  | Done    | M2-M5      | L          |
| M8  | Zoho Migration & Import Engine                     | v0.8.0  | Done    | M2-M6      | L          |
| M7  | Resume Parsing & Bulk CV Intake                    | v0.9.0  | Planned | M3         | L          |
| M9  | Global Search, Filters, Saved Views & Bulk Actions | v0.10.0 | Planned | M2-M5      | L          |
| M10 | Client Submissions & Feedback                      | v0.11.0 | Planned | M5, M6     | M          |
| M11 | Interviews & Tasks (lite)                          | v0.12.0 | Planned | M5, M6     | M          |
| M12 | Offers, Placements & Job Revenue                   | v0.13.0 | Planned | M5         | M          |
| M13 | Email Integration                                  | v0.14.0 | Planned | M6         | L          |
| M14 | Agency Reports & Analytics                         | v0.15.0 | Planned | M5, M10    | M          |
| M15 | Candidate Matching & Semantic Search               | v0.16.0 | Planned | M7, M9     | L          |
| M16 | Public API, Webhooks & Career Page                 | v0.17.0 | Planned | M9         | L          |
| M17 | Compliance: GDPR, Blocklist & Data Tools           | v0.18.0 | Planned | M8         | M          |
| M18 | Security, Performance & Production Hardening       | v0.19.0 | Planned | all        | L          |
| M19 | v1.0 Production Release                            | v1.0.0  | Planned | M18        | M          |

Complexity scale: S (days), M (about a week), L (1-2 weeks), XL (2-3 weeks).
Estimates assume one primary developer plus AI tooling.

## Milestone scope summaries (audit-derived)

- **M2 Companies & Contacts (done, v0.3.0)**: unchanged scope; field shape already
  mirrors Zoho Clients/Contacts (owner = account manager) for 1:1 import.
  Tags schema ships here; tags UI is deferred (feature unused in Zoho).
- **M3 Candidates**: candidate CRUD with Zoho-parity fields, education/experience
  sub-records, unique-email dedupe with merge prompt, CV attachment upload
  (MinIO), sourcer ownership, human ids (CAND-0001), source tracking, list at
  10k-records performance. Basic CSV import for day-one manual use.
- **M4 Jobs**: job CRUD; company REQUIRED + optional hiring contact; account
  manager owner; slim status set (open/on_hold/filled/cancelled/inactive);
  rich-text JD; free-text salary + optional structured range; location + remote;
  positions; dates. Record page shows the job's pipeline summary.
- **M5 Applications**: associate candidate to job (unique pair), two-level
  stage+status machine seeded from our real Zoho statuses (incl. Submitted to
  client / Approved by client / Rejected by client loop and rejection reasons),
  status history events, kanban board per job + global, guards for read-only role.
  This is the product's heart; the audit's funnel (38 candidates on one Porsche
  role) is the benchmark scenario.
- **M6 Notes & Timeline**: polymorphic notes with @mentions, workspace note
  templates (screening-call template from the audit is the default), in-app
  notifications inbox, per-record timeline fed by a domain event bus, org-wide
  activity feed. The sourcer -> account-manager handoff must feel better than
  Zoho's.
- **M7 Resume Parsing**: single + bulk CV upload queue, parser (evaluated against
  our real DACH/EU CV mix), auto-create candidate + education/experience + CV
  attachment, review/confirm screen, dedupe check against existing emails,
  parse-failure triage list.
- **M8 Zoho Migration & Import Engine**: full plan in
  docs/audit/zoho-migration-plan.md. API-based, idempotent (external_refs),
  ordered (users -> clients -> contacts -> candidates -> jobs -> applications ->
  notes -> attachments -> history), delta re-runs, verification report, merge
  tools for flagged duplicates, generic CSV import. Exit criterion: the agency's
  full Zoho dataset lives in Emerge with relationships intact and reconciled
  counts; the team can switch.
- **M9 Search & Views**: global Cmd+K search across candidates/jobs/companies/
  contacts/applications, quick filters + filter builder, saved views, column
  visibility, bulk select + actions (status change, owner change, delete),
  CSV export. Custom-fields UI explicitly deferred post-1.0 (zero used in Zoho).
- **M10 Client Submissions**: first-class sendout record layered on the M5
  statuses (who sent which candidates to which client contact, when, via what),
  submission history per job/client, client feedback capture (tokened share link,
  no client login), auto status sync application <-> submission.
- **M11 Interviews & Tasks (lite)**: interview scheduling on an application
  (slot, participants, location/meet link, reminder notifications), outcome
  verdict + feedback, simple tasks with due dates on records. No native video,
  no picklist round names, no assessments.
- **M12 Offers & Placements**: offer lifecycle statuses on the application,
  placement record on hire (start date, fee/revenue actuals), job revenue
  summary. Lightweight - the audit shows zero current usage, but placements are
  how an agency measures itself.
- **M13 Email**: connected mailbox or SMTP send, templates, send from candidate/
  application/submission, log to timeline. Two-way sync explicitly post-1.0.
- **M14 Reports**: the agency KPIs the data begs for: submissions per sourcer per
  week, pipeline funnel + conversion, time-in-stage, time-to-first-submission,
  client health (jobs open, last submission), AM/sourcer leaderboards. Built on
  M5/M10 history events.
- **M15 Matching**: embeddings for candidates and jobs, "find candidates for this
  job" / "find jobs for this candidate", semantic search on skills. Post-migration
  so it launches with 1,300+ real profiles.
- **M16 Platform**: versioned public REST API + API keys, outbound webhooks,
  optional public careers page + apply form (audit: unused in Zoho, so it ships
  behind a toggle, off by default).
- **M17 Compliance**: GDPR data export/delete per candidate, consent + email
  opt-out flags, blocklist, retention policies, workspace data export.
- **M18 Hardening**: security review pass, rate limiting, backup/restore drills,
  performance budget on 10k+ datasets, observability.
- **M19 v1.0**: docs site, self-host guide (Docker), demo seed, upgrade path,
  release.

## Post-1.0 backlog (deliberately out of v1.0)

Candidate portal; client portal login (tokened links cover v1); automation rules /
sequences / Blueprint-style flows; assessments & questionnaires with auto-scoring;
custom fields UI (jsonb columns already reserved); tags UI (schema shipped in M2);
formatted/branded CV generator; resume inbox (email-in); two-way email sync;
job-board multiposting; video interviews; SMS/WhatsApp/CTI telephony; Chrome
sourcing extension; temp/contract back office (timesheets, pay & bill); native
mobile apps; granular permission profiles; parent-company hierarchies.

## Dependency notes

- M3 and M4 can proceed in parallel after M2 (candidates depend only on M1 auth,
  jobs need companies).
- M5 needs both M3 and M4; M6 layers collaboration on everything before it.
- M7 (parsing) needs M3's candidate + attachment model. M8 (migration) needs every
  core object M2-M7, and M6's event history to import status timelines.
- M9 search closes Phase 1 so the switched-over team can actually live in the app
  at 1,300+ candidates.
- M10 formalizes what M5 statuses already track - order chosen so switch-over
  (M8) never waits on it.
- M14 reports read M5 status history + M10 submissions - both must emit clean
  events from day one.
- M15 sits after migration on purpose: matching is only credible with the real
  corpus imported.

## Release process per milestone

1. All acceptance criteria in the milestone doc pass.
2. Tests, lint, and production build pass in CI.
3. Documentation updated (including this file's status column).
4. `release/vX.Y.0` branch -> final checks -> merge to `main`.
5. Tag `vX.Y.0`, create GitHub release titled `Milestone N - <name>`.
6. Merge back to `develop`, open next milestone.

See [development.md](development.md) for the full workflow.
