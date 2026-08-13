# API Conventions

> No API exists yet. This page records the contract conventions; endpoint documentation
> is added per milestone.

## Internal API (tRPC) - from M1

- Routers per domain: `auth`, `users`, `companies`, `contacts`, `candidates`, `jobs`,
  `applications`, `pipeline`, `tasks`, `notes`, `documents`, `search`, ...
- Every procedure requires an authenticated session and enforces workspace scope + role
  permission server-side. No client-trusted authorization.
- Input validation with Zod on every procedure; errors returned as typed error codes
  (`FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `VALIDATION`), never raw exceptions.
- List procedures: cursor pagination (`limit`, `cursor`), consistent
  `{ items, nextCursor }` envelope; filtering/sorting params mirror the Views engine (M8).

## Public API (REST, OpenAPI) - M17

- Versioned base path `/api/v1/`; API-key auth (`Authorization: Bearer`), per-key scopes
  and rate limits.
- Resources mirror core objects: `/candidates`, `/companies`, `/contacts`, `/jobs`,
  `/applications`, plus `/webhooks` management.
- OpenAPI spec generated from the same Zod schemas as tRPC (single source of truth) and
  published with the docs site.
- Webhooks (M14) deliver domain events (`application.stage_changed`, `candidate.created`,
  ...) with HMAC signatures and retry/backoff.

## Career portal endpoints (M9)

- Public, unauthenticated, rate-limited: job list, job detail, apply (multipart with CV).
- Anti-abuse: honeypot + rate limit; no CAPTCHA dependency in core.
