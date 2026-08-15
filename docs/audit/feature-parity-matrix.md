# Zoho Recruit Feature Parity Matrix

Classification: MUST (needed to replace Zoho for our team) / SHOULD (needed to be a
credible product soon after) / NICE (valuable, not urgent) / NOT (deliberately not
copied). "Migration" = does switching from Zoho require importing this data.
Milestones reference the updated roadmap (docs/roadmap.md), reconciled 15 Aug 2026
against the live post-cutover audit (`zoho-live-audit-2026-08-15.md`). The
"Audit ID" column ties each row to the gap list in that audit (H* = HIGH, M* =
MEDIUM); every gap maps to exactly one milestone (see roadmap
§"Audit gap → milestone traceability").

**Delivered so far:** M0 (v0.1.0) foundation, M1 (v0.2.0) auth/RLS/roles,
M2 (v0.3.0) Companies & Contacts, M3 (v0.4.0) Candidates + CV + dedupe,
M4 (v0.5.0) Jobs, M5 (v0.6.0) Applications pipeline + kanban + status history,
M6 (v0.7.0) Notes + @mentions + notifications + per-record timeline +
org-wide activity feed + note templates, **M8 (v0.8.0) Zoho migration engine -
full dataset live (86 companies / 12 contacts / 1,298 candidates / 101 jobs /
763 applications / 1,218 notes).** Next: **attachment (CV) backfill** (data
task, no code - 1,293 CVs still to pull), then M7 resume parsing. The Timeline
reads existing events (audit_log + status history + notes), so it is populated
without a separate event-bus write path for now.

**Live dashboard shipped (15 Aug, ahead of M14):** /dashboard is a real
recruitment command center reading live RLS-scoped data (no mock numbers): KPI
cards (active jobs, candidates, applications, submitted/interview/offered/hired/
rejected, time-to-hire, time-to-fill), a pipeline widget, recent candidates +
jobs, weekly trends, recruiter performance, and a recent-activity feed. Cards
drill through to the underlying lists; it auto-refreshes every 30s and on window
focus; empty states are graceful. Full custom report builder + scheduling stay
M14.

## Core objects

| Zoho feature                               | Priority | Our equivalent                                          | Data | UI              | Backend            | Migration           | Milestone        |
| ------------------------------------------ | -------- | ------------------------------------------------------- | ---- | --------------- | ------------------ | ------------------- | ---------------- |
| Clients module + Account Manager owner     | MUST     | Companies, owner = AM                                   | yes  | list + record   | CRUD/list          | yes (85)            | M2 (in progress) |
| Contacts under clients, primary flag       | MUST     | Contacts                                                | yes  | list + record   | CRUD/list          | yes (12)            | M2 (in progress) |
| Parent Client hierarchy                    | NICE     | parent_company_id                                       | yes  | picker          | small              | no (unused)         | post-1.0         |
| Candidates CRUD, unique email dedupe       | MUST     | Candidates                                              | yes  | list + record   | CRUD + dedupe      | yes (1,287)         | M3               |
| Education/Experience tabular sub-grids     | MUST     | candidate_education/experience                          | yes  | record section  | CRUD               | yes (parsed data)   | M3               |
| Candidate autonumber IDs (ZR_n_CAND)       | SHOULD   | human_id per entity                                     | yes  | display         | sequence           | map old ids         | M3               |
| Candidate sources (26 picklist)            | MUST     | source enum (slimmed)                                   | yes  | filter/badge    | enum               | yes                 | M3               |
| Candidate dual status+stage                | NOT      | pipeline lives on Application only                      | -    | -               | -                  | statuses map to app | -                |
| Jobs with REQUIRED client + hiring contact | MUST     | Jobs                                                    | yes  | list + record   | CRUD/list          | yes (101)           | M4               |
| Job status machine (9 values)              | MUST     | 5-status enum (slimmed to used ones)                    | yes  | badges/filters  | enum               | yes                 | M4               |
| Rich-text job description                  | MUST     | rich text editor                                        | yes  | editor          | sanitized html     | yes                 | M4               |
| Free-text salary + structured option       | MUST     | both fields                                             | yes  | inline          | -                  | yes                 | M4               |
| Revenue forecast per job (expected/actual) | NICE     | placements revenue                                      | yes  | record panel    | computed           | no (unused)         | M12              |
| Hot job flag, submission limit             | NICE     | flag + limit                                            | yes  | badge           | check              | no                  | post-1.0         |
| Applications = candidate x job junction    | MUST     | Applications                                            | yes  | everywhere      | CRUD + unique pair | yes (756)           | M5               |
| 30-value status + 7-stage colored kanban   | MUST     | stage + status dictionary (seeded with our used values) | yes  | kanban + badges | status machine     | yes + history       | M5               |
| Status history / time-in-stage             | MUST     | application_status_history                              | yes  | timeline        | event write        | partial (timelines) | M5               |
| Rejection reasons (structured)             | SHOULD   | rejection_reason                                        | yes  | dialog          | enum               | yes where present   | M5               |
| Kanban pipeline board                      | MUST     | Board view per job + global                             | -    | drag-drop board | stage transitions  | -                   | M5               |

## Collaboration

| Zoho feature                                | Priority | Our equivalent                     | Data | UI                    | Backend                 | Migration             | Milestone |
| ------------------------------------------- | -------- | ---------------------------------- | ---- | --------------------- | ----------------------- | --------------------- | --------- |
| Notes on any record                         | MUST     | notes (polymorphic)                | yes  | record + composer     | CRUD                    | yes (200+)            | M6        |
| @mentions in notes + notification           | MUST     | mentions + in-app notifications    | yes  | mention picker, inbox | notification fan-out    | preserve mention text | M6        |
| Templated screening-call note               | MUST     | note templates (per workspace)     | yes  | template insert       | small                   | n/a                   | M6        |
| Record timeline (field/status/assoc events) | MUST     | activities event bus + timeline UI | yes  | record timeline       | event emit on mutations | partial               | M6        |
| Org-wide activity log                       | MUST     | activity feed + existing audit_log | yes  | feed page             | query                   | no                    | M6        |
| Tasks / Events / Calls                      | NICE     | activities-lite (tasks only first) | yes  | task list             | CRUD                    | no (0 records)        | M11       |
| Note share-to-client flag                   | NICE     | share flag reserved                | yes  | toggle                | portal later            | no                    | post-1.0  |

## Intake & documents

| Zoho feature                         | Priority | Our equivalent                                                          | Data | UI                        | Backend         | Migration            | Milestone       |
| ------------------------------------ | -------- | ----------------------------------------------------------------------- | ---- | ------------------------- | --------------- | -------------------- | --------------- |
| Resume parser import (the #1 intake) | MUST     | parsing pipeline (upload -> parse -> candidate + edu/exp + CV attached) | yes  | drop-zone + review screen | parser worker   | n/a                  | **M7 done (v0.9.0)** |
| Bulk CV import (folder/multi-file)   | MUST     | batch upload queue                                                      | yes  | progress UI               | queue jobs      | n/a                  | **M7 done (v0.9.0)** |
| LLM provider (any) + own API key     | SHOULD   | per-workspace AI settings (anthropic + openai-compatible), keys encrypted | yes  | Settings > AI            | @emerge/ai      | n/a                  | **M7 done (v0.9.0)** |
| Attachments on records               | MUST     | attachments (MinIO)                                                     | yes  | files panel               | upload/download | yes (CVs via API)    | M3 (basic) / M7 |
| Formatted/branded CV generation      | NICE     | formatted CV export                                                     | -    | template                  | renderer        | no                   | post-1.0        |
| Resume inbox (email CVs in)          | NICE     | inbox address per workspace                                             | yes  | queue                     | mail-in worker  | n/a                  | post-1.0        |
| Duplicate check on import (email)    | MUST     | dedupe + merge prompt                                                   | -    | merge dialog              | matcher         | dedupe during import | M3/M7/M8        |

## Migration & data admin

| Zoho feature                           | Priority | Our equivalent                                                          | Data | UI                     | Backend               | Migration        | Milestone                 |
| -------------------------------------- | -------- | ----------------------------------------------------------------------- | ---- | ---------------------- | --------------------- | ---------------- | ------------------------- |
| Zoho -> Emerge full migration          | MUST     | Zoho API import engine (relationship-preserving, idempotent, resumable) | yes  | import wizard + report | worker pipeline       | IS the milestone | M8                        |
| CSV import/export per module           | MUST     | generic CSV import/export                                               | yes  | mapping UI             | streaming             | alternative path | M8 (import) / M9 (export) |
| External-id mapping (re-runnable sync) | MUST     | external_refs table                                                     | yes  | -                      | upsert by external id | core mechanism   | M8                        |
| Record merge (dupes)                   | SHOULD   | merge tool                                                              | -    | compare UI             | merge svc             | during import    | M8                        |
| Mass update / bulk actions             | SHOULD   | bulk select + actions                                                   | -    | toolbar                | batch endpoints       | -                | M9                        |

## Search & views

| Zoho feature                       | Priority | Our equivalent                           | Data     | UI              | Backend        | Migration     | Milestone                |
| ---------------------------------- | -------- | ---------------------------------------- | -------- | --------------- | -------------- | ------------- | ------------------------ |
| Global search across modules       | MUST     | fast global search (pg trigram/tsvector) | idx      | omnibox (Cmd+K) | search svc     | -             | M9                       |
| Column filters + sorting           | MUST     | DataTable filters                        | -        | filter bar      | list-query     | -             | M2+ each list, M9 polish |
| Saved / custom views               | SHOULD   | saved_views                              | yes      | view switcher   | CRUD           | no            | M9                       |
| Advanced search (criteria builder) | SHOULD   | filter builder jsonb                     | -        | builder UI      | query compiler | -             | M9                       |
| Custom fields                      | NICE     | custom_fields jsonb + defs UI            | reserved | defs UI later   | validation     | none (0 used) | post-1.0                 |
| Tags                               | NICE     | schema shipped in M2; UI later           | done     | chips           | done           | none (0 used) | post-1.0 UI              |

## Client-facing workflow

| Zoho feature                            | Priority | Our equivalent                       | Data | UI                   | Backend            | Migration      | Milestone |
| --------------------------------------- | -------- | ------------------------------------ | ---- | -------------------- | ------------------ | -------------- | --------- |
| "Submitted to client" loop via statuses | MUST     | in M5 status machine                 | yes  | board/badges         | statuses           | yes            | M5        |
| Submissions module (formal sendouts)    | SHOULD   | submissions table on top of statuses | yes  | sendout dialog + log | CRUD + email later | no (0 records) | M10       |
| Client feedback capture                 | SHOULD   | feedback on submission               | yes  | form/share link      | tokened link       | no             | M10       |
| Client portal (login)                   | NICE     | portal app                           | yes  | portal               | auth scope         | no             | post-1.0  |
| Candidate submission limit per job      | NICE     | limit check                          | yes  | warning              | check              | no             | post-1.0  |

## Interviews, offers, assessments

| Zoho feature                                | Priority      | Our equivalent                                           | Data | UI                     | Backend         | Migration      | Milestone |
| ------------------------------------------- | ------------- | -------------------------------------------------------- | ---- | ---------------------- | --------------- | -------------- | --------- |
| Interview scheduling + verdict              | SHOULD        | interviews (lite: slot, participants, outcome, reminder) | yes  | scheduler + record tab | CRUD + notify   | no (0 records) | M11       |
| Video interview (native/live/recorded)      | NOT           | use Meet/Teams links in location field                   | -    | -                      | -               | no             | -         |
| Assessments/questionnaires + auto-scoring   | NICE          | scorecards-lite later                                    | yes  | forms                  | scoring         | no             | post-1.0  |
| Reviews (polymorphic evaluations)           | NICE          | folded into interviews/submissions feedback              | -    | -                      | -               | no             | -         |
| Offer records + approval flow + e-sign      | SHOULD (lite) | offer status on application + placements                 | yes  | dialog                 | status + record | no             | M12       |
| Placements + actual revenue                 | SHOULD        | placements                                               | yes  | record + report        | CRUD            | no             | M12       |
| Conversion candidate -> employee/onboarding | NOT           | placement marks hired; no HRIS handoff                   | -    | -                      | -               | no             | -         |

## Comms, automation, analytics

| Zoho feature                             | Priority     | Our equivalent                                                                       | Data    | UI                   | Backend      | Migration        | Milestone       |
| ---------------------------------------- | ------------ | ------------------------------------------------------------------------------------ | ------- | -------------------- | ------------ | ---------------- | --------------- |
| Email send + templates + log to timeline | SHOULD       | email integration (SMTP/provider)                                                    | yes     | composer + templates | send worker  | no               | M13             |
| Two-way email sync                       | NICE         | provider sync                                                                        | yes     | thread view          | sync worker  | no               | post-1.0        |
| Workflow rules / Blueprint automation    | NICE         | automation rules engine                                                              | yes     | rules UI             | rule runner  | no (unused)      | post-1.0        |
| Webhooks                                 | SHOULD       | outbound webhooks                                                                    | yes     | settings             | dispatcher   | no               | M16             |
| Home dashboard (live KPI command center) | SHOULD       | /dashboard: live KPIs (jobs/candidates/apps/pipeline stages/time-to-hire+fill), pipeline widget, recent candidates+jobs, weekly trends, recruiter perf, activity feed; clickable drill-through; 30s auto-refresh; real RLS-scoped data | done | done | dashboard.overview | reads live | **DONE (ahead of M14)** |
| Reports & dashboards (full builder)      | SHOULD       | agency KPI reports (submissions/sourcer/week, funnel, time-to-submit, client health) + scheduling | -       | report builder       | aggregates   | no               | M14             |
| Zia AI matching / semantic search        | NICE         | embedding match (candidates <-> jobs)                                                | vectors | match panel          | embed worker | no               | M15             |
| Career site + public apply + job boards  | NICE         | careers page + apply form                                                            | yes     | public page          | public api   | no (0 published) | M16 or post-1.0 |
| Candidate portal                         | NOT (for v1) | -                                                                                    | -       | -                    | -            | no               | post-1.0        |
| Campaigns                                | NOT          | -                                                                                    | -       | -                    | -            | no (unused)      | -               |
| SMS/telephony/CTI                        | NOT (for v1) | -                                                                                    | -       | -                    | -            | no               | post-1.0        |

## Platform & security

| Zoho feature                           | Priority | Our equivalent                             | Data | UI              | Backend     | Migration          | Milestone         |
| -------------------------------------- | -------- | ------------------------------------------ | ---- | --------------- | ----------- | ------------------ | ----------------- |
| Users, roles, ownership                | MUST     | done (M1) + owner FKs per entity           | done | done            | done        | user mapping in M8 | M1 done           |
| Granular profiles/permissions          | NOT (v1) | 3 roles suffice (Zoho org: everyone admin) | -    | -               | -           | no                 | post-1.0 if asked |
| Audit history per record               | MUST     | activities + audit_log                     | yes  | timeline        | events      | partial            | M6                |
| GDPR consent, blocklist, email opt-out | SHOULD   | flags + blocklist check                    | yes  | badges/settings | checks      | carry flags        | M17               |
| Public REST API + API keys             | SHOULD   | versioned public API                       | yes  | docs            | keys/scopes | no                 | M16               |
| Import/export at scale                 | MUST     | covered above                              | -    | -               | -           | -                  | M8/M9             |

## Missing from our product today (gap analysis vs live Zoho, 15 Aug 2026)

Reconciled against `zoho-live-audit-2026-08-15.md` §2. Audit IDs in brackets;
every gap has a milestone (roadmap §"Audit gap → milestone traceability").

**Now DONE (were gaps 1–5, 7 in the pre-cutover matrix):** core objects M2–M5,
notes/@mentions M6, status history M5, Zoho migration M8 - the full dataset is
live.

**Remaining HIGH (blocks daily use):**
1. **[H2] Candidate CV attachments - DONE (15 Aug).** 1,500 CVs backfilled to
   MinIO across 1,295 of 1,297 candidates (0 failures); the other 2 have no
   attachment in Zoho. Recruiters can now download a CV from the record.
2. **[H6] Resume parsing** - Zoho's real intake (1,034 of 1,298 candidates). M7.
3. **[H3] Global search** across modules - M9.
4. **[H1] Interviews module** (schedule/feedback/status FSM) - M11.
5. **[H4] Send email from a record** - M13 (Resend already wired).
6. **[H7] Offer flow** (made/accepted/withdrawn + expiry) - M12.
7. **[H8] Client review of submitted candidates** - M10 via **tokened share
   links** (no login). Reconciliation: the audit flagged a full client *login*
   portal as HIGH; we meet the underlying need (client approves/rejects/comments
   on submissions) with a no-login link in M10, and defer the login portal to
   post-1.0. The `Client portal (login)` row below stays post-1.0 intentionally.
8. **[H5] Career site + web-to-candidate** - M16, behind a toggle (LOW in
   practice: 0 CareerSite-sourced records in the live org).

**Remaining MEDIUM:** tags UI [M1-audit] → M9 · saved views [M2-audit] → M9 ·
mail merge [M9-audit] → M13 · reports/dashboards → M14 · Zia matching
[M13-audit] → M15 · forecasts [M15-audit] → M12 · compliance/GDPR [M18-audit]
→ M17. Custom fields, layouts, assessments, reviews (full), approvals,
blueprints, candidate/vendor portals, formatted CV, calendar-booking,
custom functions → post-1.0 (all zero-data or non-blocking in the live org).

## Features we deliberately do NOT copy

- Candidate-level dual status+stage (unused; one pipeline, on the application).
- Denormalized mirror fields on applications (joins instead).
- Interviews-as-picklist rounds with native video (over-engineered for our desk).
- Submissions/Reviews/Assessments triple-module overlap (one clear path instead:
  statuses now, submissions table in M10, feedback on the submission).
- Campaigns module, candidate portal (v1), vendor portal, Blueprint automation,
  granular profile permission matrix, tags UI (schema kept), custom-field UI at
  launch, 124-value industry picklist (short curated list + free text), 247-country
  picklist maintenance (standard ISO list instead), fax fields.
