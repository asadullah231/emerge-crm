# Entity Model & Relationship Map

Derived from the live Zoho Recruit audit (see zoho-recruit-audit.md). This is the
canonical data model for Emerge CRM going forward.

## 1. Zoho's actual relationship model (as observed in our org)

- **Client (Zoho "Clients", internally "Accounts")** is the anchor of the client
  side. Every Job Opening has a REQUIRED Client lookup (101/101 in our data).
  Clients support a Parent Client hierarchy (unused by us).
- **Contact** belongs to a Client (lookup, nullable). Contacts serve three duties
  in Zoho: client-side hiring contacts, interviewer records, and submission
  recipients. Our org has only 12 and links them on 13% of jobs.
- **Candidate** is a global person record. Unique key: lowercased email.
  Candidate.Status/Stage exist but our team leaves them at "New": candidate-level
  pipeline is NOT the pipeline.
- **Application** = the junction record created when a candidate is associated to a
  job. It carries the REAL pipeline: a fine-grained status (30 values in Zoho) and
  a coarse colored stage (7 values), plus its own owner (the sourcer), rating, and
  a denormalized copy of the job's Account Manager.
- **Interview** references Candidate + Job (+ Client + interviewer Contacts), not
  the Application row. Zero usage in our org.
- **Submission / Review / Assessment** form Zoho's formal client-feedback loop.
  Zero usage in our org: the team runs the client loop through Application statuses.
- **Note** attaches polymorphically to any record (ours: Candidates 109,
  Applications 85, Jobs 5, Clients 1) and supports @mentions of users, plus
  share-to-client/vendor flags.
- **Activity (To-Do/Event/Call)** links via Who (Contact) / What (any record).
  Zero usage.
- **User** owns records everywhere (ownerlookup on every module). The field doing
  real routing work in our org: Job.Account_Manager. Application.Owner = sourcer.

Chain that must survive migration intact:

Client "Porsche Consulting" -> Job "Consumer Goods Operations Consultant"
-> 38 Applications (17 Rejected, 17 Submitted to client, 3 Associated,
1 Rejected by client) -> each Application -> one Candidate -> that candidate's
notes (@mention handoffs) and CV attachment.

## 2. Emerge CRM canonical model

Everything below is workspace-scoped (RLS) and follows the M1 conventions
(uuidv7 ids, timestamptz, owner FKs to users, soft delete where user-facing).

### Existing (shipped or in progress)

- `users`, `workspaces`, `memberships` (admin | recruiter | readonly), `sessions`,
  `invitations`, `password_reset_tokens`, `audit_log` - M1 (v0.2.0, shipped).
- `companies` (= Zoho Clients; owner = account manager), `contacts` (Zoho-shaped:
  email/secondary email/work phone/mobile/title/LinkedIn, primary flag, nullable
  company), `tags` + `taggings` (schema ready, UI deprioritized: Zoho tags unused)
  - M2 (in progress on feature branch).

### Planned core (Phase 1)

- `candidates`: identity (first/last name, email UNIQUE per workspace nullable,
  secondary email, phone, mobile), profile (current title, employer, experience
  years, skills text, salary expectations, address block, LinkedIn/website),
  `source` (parser | manual | import | referral | api), owner (sourcer),
  human_id (autonumber e.g. CAND-0001), custom_fields jsonb reserved, soft delete.
- `candidate_education` + `candidate_experience`: 1:N sub-tables mirroring Zoho's
  tabular grids; filled by the parser, editable in UI.
- `jobs`: title, REQUIRED company FK, nullable contact FK, owner = account manager,
  status (open | on_hold | filled | cancelled | inactive), rich-text description,
  free-text salary plus optional structured min/max/currency, location + remote
  flag, positions count, target date, opened/closed dates, human_id (JOB-0001),
  custom_fields jsonb, soft delete.
- `applications`: candidate FK + job FK (UNIQUE pair), stage (screening |
  submitted | interview | offered | hired | rejected | archived), status - the
  fine value within the stage, modeled as a workspace-configurable status
  dictionary seeded with the Zoho values we actually use (Associated, In Review,
  Submitted to client, Approved by client, Rejected by client, Interview to be
  scheduled, Interview scheduled, Interview in progress, Offer made, Hired,
  Rejected, Unqualified, Archived), rejection_reason nullable, owner = sourcer,
  rating nullable, source, timestamps per stage entry.
- `application_status_history`: application FK, from/to status + stage, actor,
  timestamp. Powers funnels, time-in-stage, and migration of Zoho's history.
- `notes`: polymorphic (entity_type + entity_id), rich text body, author,
  mentions uuid[], share flags reserved. @mention triggers in-app notification.
- `activities` (event bus, M6): entity_type + entity_id, verb, actor, payload
  jsonb - drives record timelines and the org-wide feed. Distinct from `audit_log`
  (auth/admin events) though both may merge views in UI.
- `attachments`: polymorphic, MinIO-backed (bucket/key, filename, mime, size,
  kind: cv | formatted_cv | other), uploaded_by. Candidates' primary CV is an
  attachment with kind=cv.
- `notifications`: user FK, type (mention | assignment | status_change), entity
  ref, read_at.
- `saved_views` (M9): user/workspace scope, entity, filters jsonb, columns,
  sort.
- `import_runs` + `import_records` (M8, migration engine): source (zoho | csv),
  entity mapping, external_id <-> internal id map, per-record status/errors.
  The external-id map table (`external_refs`: entity_type, internal_id, source,
  external_id UNIQUE) is what makes migration idempotent and relationships
  reconnectable.

### Planned later (Phase 2+)

- `submissions` (first-class client sendout: application FK, sent_to contact(s),
  sent_by, medium, client feedback + status) - layered ON TOP of the status
  machine when the team wants per-sendout records; until then statuses suffice.
- `interviews` (schedule + outcome verdict + reminder; video fields NOT copied).
- `placements` / offer lifecycle (offer made/accepted/declined, start date,
  fee - the revenue actuals Zoho puts on jobs).
- `email_messages` + templates (Phase 2 email integration).
- `custom_field_defs` (post-1.0; jsonb columns already reserved everywhere).

## 3. Relationship map (Emerge)

- workspace 1-N: users(memberships), companies, candidates, jobs, applications,
  notes, activities, attachments, tags.
- company 1-N contacts. company 1-N jobs. company optional-N candidates? No:
  candidates are global; they meet companies only through applications.
- job N-1 company (required), N-1 contact (optional hiring contact), N-1 user
  (account manager owner).
- application N-1 candidate + N-1 job (unique pair), N-1 user (sourcer owner);
  1-N status_history; the ONLY path between candidate and client side.
- interview (later) N-1 application (we link the application, not candidate+job
  separately - cleaner than Zoho).
- notes / attachments / activities: polymorphic to any core entity.
- users: own everything via owner FKs; @mentioned in notes; actors in history.

Design difference vs Zoho, on purpose: no denormalized mirror fields on
applications (joins/views instead), interviews link the application directly,
and "submission" starts as a status rather than a table.
