# Milestone 0 - Project Foundation

- Version on completion: **v0.1.0**
- Status: **Completed (v0.1.0, 13 Aug 2026)**
- Complexity: **M**

## Objective

Stand up the repository, toolchain, infrastructure, and CI so that every later milestone
only adds product code, never plumbing.

## User value

None directly visible; the value is that from M1 onward every increment ships behind a
stable build/test/release pipeline, and any developer (or self-hoster) can boot the full
stack with one command.

## Features included

- GitHub repository created (org/name per approval), `main` + `develop` branches, branch
  protection (no direct pushes to `main`, PRs require green CI)
- pnpm monorepo: `apps/web` (Next.js, TypeScript, Tailwind, shadcn/ui), `apps/worker`
  (BullMQ skeleton), `packages/db` (Drizzle + migration tooling), `packages/core`,
  `packages/ui`
- Docker Compose: web, worker, Postgres 16, Redis, MinIO; `.env.example`; one-command boot
- CI (GitHub Actions): lint, typecheck, test, production build on every PR; commitlint
- Base app shell: empty authenticated-area layout (sidebar nav skeleton, theme with dark
  mode), health endpoint `/api/health`
- Tooling: ESLint, Prettier, Vitest + Playwright scaffolding, husky hooks
- GitHub Milestones M0-M19 + project board created; docs (this folder) committed
- Issue + PR templates

## Database changes

None beyond an empty initial migration proving the migration pipeline runs (and a
`migrations` bookkeeping table via Drizzle Kit).

## Backend changes

Health endpoint; worker process boots, connects to Redis, runs a no-op heartbeat job.

## Frontend changes

App shell renders; light/dark theme; placeholder routes for the Phase 1 nav items.

## API changes

tRPC scaffolding mounted with a single `health.ping` procedure.

## Dependencies

None. First milestone.

## Acceptance criteria

1. `docker compose up` on a clean machine yields a running web app, worker, Postgres,
   Redis, MinIO with no manual steps beyond copying `.env.example`.
2. `pnpm lint`, `pnpm test`, `pnpm build` all pass locally and in CI.
3. A PR with a bad commit message or failing lint is blocked by CI.
4. `/api/health` returns status of DB, Redis, and storage connections.
5. Migration pipeline demonstrated: `pnpm db:migrate` runs clean on a fresh database.
6. Repo shows GitHub Milestones M0-M19 and the project board.

## Testing requirements

- CI pipeline itself is the test target: prove lint/test/build gates fire.
- One unit test (packages/core) and one e2e smoke test (app shell renders) as harness proof.

## Definition of Done

Standard checklist in [development.md](../development.md), plus: tag `v0.1.0`, GitHub
release "Milestone 0 - Project Foundation".

## Estimated complexity

M. Risk concentrates in Docker/Windows dev ergonomics and CI caching.

## Explicitly OUT of scope

- Any product feature, any real database table, any auth. No user-facing screens beyond
  the empty shell. No deployment target setup (hosting decided later; compose is the story).

## Issue breakdown (to create in GitHub when milestone opens)

1. M0-01 Repo, branches, protection rules, templates, milestones + board
2. M0-02 pnpm monorepo scaffold with package boundaries
3. M0-03 Docker Compose stack + .env.example
4. M0-04 CI workflows: lint/typecheck/test/build + commitlint
5. M0-05 App shell + theme + health endpoint + tRPC scaffold
6. M0-06 Test harness: Vitest + Playwright smoke
