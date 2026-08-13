# Architecture Decision Records

Rule: no silent architecture decisions. Anything structural gets an ADR here before or
alongside the change. Template: [decisions/ADR-0000-template.md](decisions/ADR-0000-template.md).

Statuses: `Proposed` (awaiting approval), `Accepted`, `Superseded by ADR-xxxx`, `Rejected`.

| ADR                                                         | Title                                                                          | Status                               |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------ |
| [ADR-0001](decisions/ADR-0001-typescript-monorepo.md)       | TypeScript monorepo with pnpm workspaces                                       | Accepted                             |
| [ADR-0002](decisions/ADR-0002-nextjs-single-deploy.md)      | Next.js App Router as single web deployable                                    | Accepted                             |
| [ADR-0003](decisions/ADR-0003-postgres-rls-multitenancy.md) | Postgres single-schema multi-tenancy with RLS                                  | Accepted                             |
| [ADR-0004](decisions/ADR-0004-drizzle-orm.md)               | Drizzle ORM                                                                    | Accepted                             |
| [ADR-0005](decisions/ADR-0005-custom-fields-jsonb.md)       | Custom fields via metadata + JSONB, not runtime DDL                            | Accepted                             |
| [ADR-0006](decisions/ADR-0006-trpc-internal-rest-public.md) | tRPC internal API, versioned REST public API                                   | Accepted                             |
| [ADR-0007](decisions/ADR-0007-event-bus-outbox.md)          | Domain events via transactional outbox + BullMQ                                | Accepted                             |
| [ADR-0008](decisions/ADR-0008-git-workflow.md)              | Git workflow: main/develop/feature/fix/release + Conventional Commits + semver | Accepted (directed by product owner) |
