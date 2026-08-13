# Milestone 17 - Public API, Import/Export & Integrations

- Version on completion: **v0.18.0**
- Status: Not started
- Complexity: **L**

## Objective

Open the platform: versioned public REST API with keys and docs, full-fidelity
import/export, and the integration surfaces (webhooks existed since M14) that let the
ecosystem build on the product.

## User value

Agencies integrate their website, n8n/Zapier flows, and BI tools; migrating from another
ATS (or leaving: data freedom is part of the open-source promise) is a supported path.

## Features included

- Public REST API v1 (`/api/v1/`): candidates, companies, contacts, jobs, applications
  (CRUD + stage move), documents (upload/download), placements (read), search; OpenAPI
  spec auto-generated from shared Zod schemas; docs site page with try-it console
- API keys: per-workspace, scoped (read/write per object family), hashed at rest, last-
  used tracking, revocation; per-key rate limits (Redis)
- Import v2: CSV for companies/contacts/jobs (extends M3 candidates), plus a documented
  "OpenCATS migration" recipe (their MySQL export -> our CSVs, field mapping table)
- Export v2: full workspace export (all objects as JSONL + documents from S3) as an
  async job with download link; per-view CSV export existed (M15)
- Integration recipes shipped in docs: n8n (webhook -> enrich -> write back), Zapier
  (via REST), website embed snippet for the career portal job list (iframe/JSON)
- Deprecation policy documented: v1 frozen at 1.0, additive-only

## Database changes

`api_keys`; export job bookkeeping.

## Backend changes

REST layer mapping to existing services (no logic duplication), key auth middleware +
scopes + rate limiter, exporter job, importers for the three new objects.

## Frontend changes

API keys settings UI, import wizards for new objects, export screen, docs page.

## API changes

The public API itself; internal surface unchanged.

## Dependencies

M8 (filter AST for API list queries), M14 (webhooks complete the integration story).

## Acceptance criteria

1. Every documented endpoint works as specified against the OpenAPI spec (contract
   tests generated from the spec).
2. Scoped key with read-only candidates scope: writes and other objects return 403;
   revoked key dies immediately; rate-limited key gets 429 with Retry-After.
3. Round-trip fidelity: full export -> fresh workspace import reproduces records,
   associations, stage history, and documents (checksum-verified fixture).
4. OpenCATS migration recipe validated against a real OpenCATS demo dump.
5. Career portal embed renders jobs on an external test page.

## Testing requirements

- Contract tests from OpenAPI; scope/rate-limit matrix; export/import round-trip;
  migration recipe walkthrough test.

## Definition of Done

Standard checklist + tag `v0.18.0` + release "Milestone 17 - Public API & Integrations".

## Estimated complexity

L.

## Explicitly OUT of scope

- GraphQL public API, official Zapier app listing (recipe only; listing is a business
  task), marketplace/app platform (far post-1.0), SDK packages (post-1.0, generated)

## Issue breakdown

1. M17-01 REST layer + OpenAPI generation
2. M17-02 API keys + scopes + rate limits
3. M17-03 Import v2 (companies/contacts/jobs)
4. M17-04 Full export + round-trip fidelity
5. M17-05 OpenCATS migration recipe
6. M17-06 Docs + embed snippet + contract tests
