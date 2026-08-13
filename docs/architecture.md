# Technical Architecture

> Status: ACCEPTED (13 Aug 2026, with the roadmap). Each major choice below has an ADR in
> `docs/decisions/`; changes go through new ADRs.

## Shape of the system

A TypeScript monorepo producing three runtime processes, all shipped via one Docker Compose:

| Process  | Role                                                                                                                     |
| -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `web`    | Next.js App Router app: the recruiter app (client-heavy routes), the public career portal (SSR, SEO), and the API routes |
| `worker` | Node worker running BullMQ queues: parsing, email sync, sequences, notifications, webhooks                               |
| Infra    | PostgreSQL 16+, Redis, MinIO (S3-compatible). Meilisearch optional later.                                                |

Rationale (short version; details in ADRs and the research reports):

- **Next.js over a separate Vite SPA + API server:** one deployable keeps the self-host
  story simple (`docker compose up`), and the career portal needs SSR/SEO anyway. The
  recruiter app routes stay client-heavy so the Linear-style feel (optimistic updates,
  Cmd+K, keyboard-first) is preserved. Twenty chose Vite+NestJS; Cal.com and Documenso
  chose Next.js. For a solo-velocity project, Next.js wins.
- **API: tRPC internally, REST publicly.** tRPC gives end-to-end types at maximum velocity
  for the app. The public, versioned OpenAPI REST surface ships at M17 for integrations.
  No GraphQL: it only pays off with a Twenty-style runtime metadata engine we are not building.
- **ORM: Drizzle.** SQL-close, tiny, and best-in-class for the JSONB queries the custom
  fields engine needs.
- **Multi-tenancy: single schema, `workspace_id` on every row, Postgres RLS.** Twenty's
  schema-per-tenant is more isolation than this product needs and a large complexity tax.
- **Custom fields: metadata table + JSONB values, not runtime DDL.** `field_definitions`
  describes fields; values live in a GIN-indexed `custom_fields` JSONB column per record.
  90% of Twenty's flexibility at 10% of the machinery.
- **Search: Postgres FTS + pg_trgm first** (zero extra infra for self-hosters), Meilisearch
  as an optional upgrade, **pgvector for semantic candidate-job matching** (M13). Matching
  stays inside Postgres; no external vector DB.
- **Jobs: Redis + BullMQ.** Rate limits, priorities, delayed jobs (sequences), retries.
- **Files: S3-compatible storage** (MinIO default), presigned URLs, no files on disk.
- **Events: single domain-event bus** (transactional outbox table -> worker). Timeline,
  notifications, stage automations, and webhooks are all consumers of the same stream.

## Frontend principles (from the Linear / Twenty / HubSpot research)

- **Speed is the product.** Optimistic mutations everywhere (TanStack Query onMutate +
  rollback); no spinners on common actions; virtualized tables past ~100 rows.
- **Record page = 3-column layout** (HubSpot pattern, industry standard): left profile,
  middle activity timeline, right associations (jobs, applications, documents, client).
- **Pipeline = kanban board** on the Application object; drag-drop via dnd-kit; stage
  change is an event, giving time-in-stage analytics for free.
- **Cmd+K command palette** (cmdk): jump to any record, run actions in context.
- **Triage inbox** (Linear's best idea, applied to recruiting): new applications land in a
  queue processed with single-key actions: shortlist / reject / advance / assign.
- **Opinionated defaults:** a sensible default pipeline (Sourced, Applied, Screening,
  Submitted, Interview, Offer, Placed, Rejected) that works out of the box; customization
  exists but is never required. "Simple first, then powerful."
- shadcn/ui + Tailwind for the component base; dark mode first-class; UI text English only.

## Object model (core, fixed tables)

Candidate, Company (client), Contact, Job, Application (candidate x job, pipeline-bearing,
with stage history), Activity/Event, Task, Note, Document, Interview, Offer, Placement,
User, Workspace, Role. Custom fields and saved Views extend these. Full column detail
lands in [database.md](database.md) as migrations are written per milestone.

This mirrors the OpenCATS entity graph (candidate, company, contact, joborder,
candidate_joborder, activity, attachment) with the fixes OpenCATS never made: a real
application object with stage history, an event bus, and workspace scoping.

## Security baseline

- Session auth (httpOnly cookies) for the app; API keys for the public API (M17).
- RBAC: workspace roles (Admin, Recruiter, Read-only at minimum) enforced server-side on
  every procedure; row-level security as defense in depth.
- All uploads virus-scanned surface deferred, but content-type validated, size-capped,
  and served only via presigned URLs.
- Audit history on sensitive mutations (who changed what, when) via the event bus.
- GDPR primitives from Phase 2: consent capture on portal apply, retention policy job,
  hard-delete (right to erasure) with document purge.
