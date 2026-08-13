# Changelog

All notable changes to Emerge CRM. Format loosely follows Keep a Changelog;
versions follow semantic versioning (one minor version per completed milestone).

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
