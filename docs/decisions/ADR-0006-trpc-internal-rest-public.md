# ADR-0006: tRPC internal API, versioned REST public API

- Status: Accepted
- Date: 2026-08-13

## Decision

The first-party app talks tRPC (end-to-end typed). Third parties get a versioned OpenAPI
REST API at M17, generated from the same Zod schemas.

## Context

Internal velocity wants types without codegen; the integration ecosystem (Zapier, n8n,
partner apps) wants boring, versioned REST.

## Alternatives considered

- GraphQL everywhere (Twenty): only pays off with a runtime metadata engine (ADR-0005
  rejected that); adds schema/caching complexity.
- REST everywhere: loses end-to-end types and slows every internal iteration.
- tRPC only: not a public API; unacceptable for an ecosystem play.

## Reason

Each audience gets the interface that serves it; single source of truth via shared Zod.

## Consequences

Two surfaces to maintain from M17 onward; public API changes require versioning discipline
(v1 frozen at 1.0).
