# ADR-0004: Drizzle ORM

- Status: Proposed
- Date: 2026-08-13

## Decision

Drizzle ORM + Drizzle Kit migrations as the single database access layer.

## Context

The custom-fields engine (ADR-0005) leans on JSONB operators, GIN indexes, and eventually
pgvector: SQL-close control matters more than a high-level abstraction.

## Alternatives considered

- Prisma: better studio/DX for beginners, but heavier runtime and weaker ergonomics for
  JSONB-heavy filtering and raw SQL mixing.
- TypeORM (Twenty patched theirs): maintenance risk; Twenty literally maintains a fork.
- Raw SQL + Kysely: maximum control, but slower for the ~80% of CRUD.

## Reason

2026 consensus for SQL-comfortable TypeScript teams with complex queries; near-zero
runtime overhead; migrations as plain SQL that a reviewer can read.

## Consequences

Fewer scaffolding conveniences than Prisma; the team owns query performance explicitly.
