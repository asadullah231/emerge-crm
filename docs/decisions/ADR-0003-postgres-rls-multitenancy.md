# ADR-0003: Postgres single-schema multi-tenancy with workspace_id + RLS

- Status: Accepted
- Date: 2026-08-13

## Decision

All tenant data lives in one Postgres schema. Every tenant-scoped table carries
`workspace_id`; Postgres Row-Level Security policies enforce isolation as defense in depth
below the application-layer checks.

## Context

Twenty runs schema-per-tenant with runtime migrations per workspace: powerful but a large
complexity tax (migration fan-out, connection management, cache invalidation).

## Alternatives considered

- Schema-per-tenant (Twenty): strongest isolation, highest complexity. Not needed at this
  product's scale; revisit only if enterprise buyers demand physical isolation.
- Database-per-tenant: operationally heavy for self-hosters.
- App-layer-only scoping: one missed WHERE clause leaks data across agencies. Rejected.

## Reason

Simple, standard, safe: one migration path, trivial backups, RLS catches application bugs.

## Consequences

Every query runs with the workspace context set; all new tables must add the RLS policy
(enforced by a migration lint check). Cross-workspace features (none planned) would need
explicit escape hatches.
