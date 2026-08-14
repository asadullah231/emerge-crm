# Changelog

All notable changes to Emerge CRM. Format loosely follows Keep a Changelog;
versions follow semantic versioning (one minor version per completed milestone).

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
