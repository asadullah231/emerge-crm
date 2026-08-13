# ADR-0001: TypeScript monorepo with pnpm workspaces

- Status: Proposed
- Date: 2026-08-13

## Decision

One repository, one language (TypeScript end-to-end), pnpm workspaces with packages:
`apps/web` (Next.js), `apps/worker` (BullMQ worker), `packages/db` (Drizzle schema +
migrations), `packages/core` (domain logic, shared types, Zod schemas), `packages/ui`
(shared components).

## Context

Solo-velocity project that must stay coherent as it grows to ~20 milestones. Twenty,
Cal.com, and Documenso all ship TypeScript monorepos.

## Alternatives considered

- Polyglot (e.g. Python for parsing/AI): rejected for v1; parsing runs fine in Node and one
  language halves the maintenance surface. A Python sidecar can be added later behind a queue.
- Multi-repo: rejected; type-sharing between web/worker/db is the main productivity win.
- Nx/Turborepo build orchestration: optional, can be added when build times justify it.

## Reason

End-to-end types from DB schema to UI, single CI, single versioning scheme.

## Consequences

Node is the only runtime dependency; contributors need pnpm; heavy AI/ML workloads later
will need a service boundary (queue) rather than an in-process library.
