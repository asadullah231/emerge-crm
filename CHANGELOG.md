# Changelog

All notable changes to Emerge CRM. Format loosely follows Keep a Changelog;
versions follow semantic versioning (one minor version per completed milestone).

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
