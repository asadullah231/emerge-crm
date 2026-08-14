# Milestone 8 - Zoho Migration & Import Engine

- Version on completion: **v0.8.0**
- Status: **In progress (14 Aug 2026)**
- Complexity: **L**
- Depends on: M2-M6 (the destination objects, their RLS, external ref plumbing)

> Pulled ahead of M7 Resume Parsing by explicit direction on 14 Aug 2026: the
> live Zoho Recruit dataset (1,296 candidates, 762 applications, 1,218 notes,
> ~1,300 CVs) is the biggest risk in the switch-over, so we build and prove
> the migration engine now, then resume the M7 roadmap.

## Objective

Move the entire live Zoho Recruit dataset into Emerge with every relationship
intact, running safely, resumably, and idempotently. Zoho stays untouched and
read-only throughout - the engine only reads from Zoho and writes to Emerge.

The design is fixed in [`docs/audit/zoho-data-migration-map.md`](../audit/zoho-data-migration-map.md);
this milestone implements it and ships it as the `@emerge/migration` package
plus its CLI.

## Features

- New tables `external_refs`, `import_runs`, `import_records` (RLS-scoped) as
  the idempotency + audit backbone. Every imported row upserts through
  `external_refs` (source, entity_type, external_id) so re-runs never
  duplicate and relationships reconnect by external id, not by name.
- Read-only Zoho snapshots to JSONL under `.migration/snapshot/` (gitignored;
  contains real PII).
- Pure transformers per entity (company/contact/candidate/subforms/job/
  application/note), each with a full field map, HTML sanitizing for job
  descriptions, and passthrough of any unmapped Zoho field into
  `custom_fields.zoho.*` so nothing is silently dropped.
- Zoho -> Emerge value maps for the 30 application statuses (both actual_value
  and display-value keys), job statuses, employment type, candidate source.
  Unknown values map to `archived / imported_unknown` with the original
  preserved and surfaced in the verification report.
- User mapping: many Zoho user records collapse to one Emerge identity by
  email; the proposed map is generated from the users snapshot and reviewed
  manually before any import (`build-user-map` CLI).
- Row-level validators; a failing row is skipped and logged with a reason, the
  run continues.
- Per-entity RLS transactions (parents commit before children need their
  refs). In-memory ref cache primed at the start of each transaction turns
  ref lookups into O(1) map hits, cutting round-trips to the VPS DB.
- Idempotency + resume: `import_records` is the queryable ledger + resume
  cursor + rollback list. A re-run with the same snapshot is a no-op (payload
  hash short-circuits unchanged rows).
- Rollback: `rollback <run-id>` deletes rows created by that run in reverse
  dependency order and removes their external_refs. Updated rows are
  restore-eligible (pre-image captured); a full restore CLI follows in a
  later iteration.
- Verification: `verify <snapshot> --workspace` compares source vs external_ref
  vs table row counts per entity.
- CLI: `build-user-map | dry-run | import | rollback | verify` (`emerge-migrate`
  bin from `@emerge/migration`).
- Bin helper `create-staging-workspace` for Phase B drills.

## Non-goals (this milestone)

- Attachment/CV file migration (~1,293 files) is planned but gated on Zoho
  attachment scope + rate-limit testing; ships as a follow-up under this same
  milestone once the token has the right scopes.
- Historical @mention notifications are NOT fanned out (nobody wants 646
  unread pings on day one). Mention markup is rewritten so future notes still
  notify.
- Historical timeline events beyond audit_log + application_status_history +
  notes (already the M6 sources) - Zoho's per-record timeline is a follow-up.
- Custom fields UI (still 0 in the source; deferred post-1.0).

## Database / backend

- Schema additions in `packages/db/src/schema.ts`: `external_refs`,
  `import_runs`, `import_records` + enums `import_run_mode`,
  `import_run_status`, `import_record_action`.
- Migration `0013_m8_import_engine.sql` (generated) + hand-written
  `0014_rls_m8.sql` (ENABLE RLS + `workspace_isolation` policy on each).
- New package `packages/migration` (transforms + validators + import engine +
  rollback + verify + CLI). Depends on `@emerge/db` only.

## Frontend

None in this milestone (the CLI is the operator-facing surface). An admin UI
for triggering + monitoring runs is a Phase C follow-up.

## Migration flow (approved 14 Aug)

Phase A - engine + dry-run (no production writes). SHIPPED at this milestone
tag: schema, engine, snapshots, user-map generator, dry-run report shown to
Asad for approval.

Phase B - staging workspace on the dev DB. Full import into a "Zoho Import
Staging" workspace, verify counts vs baseline, rollback drill (import ->
rollback -> re-import) to prove undo, browser spot-check of the benchmark
chain (Porsche Consulting -> job -> 38 applications).

Phase C - production workspace import + delta + short cutover. Zoho remains
read-only for a quarter as the ultimate rollback.

## Acceptance criteria

- Dry-run against the live snapshot reports 0 failures on validation.
- Staging import creates the expected row counts per entity (85/12/1,297/101/
  763/1,218 vs the API-verified baseline).
- Every external_ref count equals its table row count and its source snapshot
  count (verify report `ok: true` per entity).
- The Porsche Consulting benchmark chain renders with the same application
  count on both sides.
- Re-running the importer produces zero net changes (idempotency).
- Rollback drill: import into staging, roll back, staging table counts return
  to zero.

## Testing

- Unit tests in `packages/migration/src/__tests__/transforms.test.ts` cover
  every transformer + status-map + mention extraction + HTML sanitizer +
  user-map dedup, all on synthetic fixtures (repo is public; no real PII in
  the repo).
- Manual staging-import drill is the integration test (recorded in Phase B
  notes on the release PR).

## Definition of Done

- All acceptance criteria met on staging.
- Docs updated: this file (Completed), `docs/roadmap.md` M8 -> Done, CHANGELOG
  v0.8.0 entry, feature-parity matrix notes the migration engine.
- Release: PR to develop -> release/v0.8.0 -> main + tag + GitHub release
  "Milestone 8 - Zoho Migration & Import Engine".

## Notes on prior roadmap state

The 13 Aug audit-derived roadmap sequenced M7 Resume Parsing before M8
Migration. On 14 Aug Asad prioritized migration first, so we're releasing
migration as **v0.8.0** and shifting Resume Parsing to **v0.9.0**. The
audit's rationale still holds - migration needs the destination objects,
which all shipped by M6.
