# Milestone 8 - Search, Filters, Saved Views & Custom Fields

- Version on completion: **v0.9.0** (Phase 1 / MVP complete)
- Status: Not started
- Complexity: **XL** (split aggressively into issues)

## Objective

Find anything instantly and slice any list any way: global search, per-object advanced
filters, saved Views (table + kanban), the custom fields engine, and Cmd+K. Closes
Phase 1: after this the product is a usable daily driver for a real desk.

## User value

"Java developers in Manchester with consent, not contacted in 90 days" is a saved view,
one click away. Any record reachable in two keystrokes.

## Features included

- Global search (Postgres FTS + pg_trgm): candidates, companies, contacts, jobs, notes;
  typo-tolerant prefix matching; scoped shortcuts (`c:` candidates ...); document
  full-text (CV text from M7) included for candidates
- Cmd+K command palette (cmdk): instant local recents + navigation + actions, merged
  server results; contextual actions on the open record ("Move stage", "Add note", ...)
- Advanced filter builder per object: field operators (contains/equals/gt/lt/in/empty),
  AND/OR groups (Twenty pattern), including custom fields and tags
- Saved Views: named views per object, type table or kanban, filters + sorts + visible
  columns + group-by persisted; personal and shared (workspace) views; default view per
  user
- Custom fields engine (ADR-0005): admin UI to define fields (13 types incl. select,
  multi-select, relation, rating) on candidate/company/contact/job/application; fields
  render in record pages, tables, filters, and forms automatically
- Keyboard map v1: single-key actions on focused rows/cards, `g`-prefixed navigation
  (Linear pattern); shortcut cheatsheet (`?`)

## Database changes

`field_definitions`, `views`, `view_filters`, `view_sorts`; FTS generated columns +
GIN/trigram indexes on searchable tables; document text table for CV full-text.

## Backend changes

Query compiler: filter AST -> SQL (incl. JSONB operators for custom fields) used by both
list endpoints and (later) automation conditions; search service with ranking; view CRUD.

## Frontend changes

Filter builder UI, view switcher/tabs on every list, custom fields admin, palette,
keyboard system (global listener + per-context registries), field renderers keyed by type.

## API changes

Routers `search`, `views`, `fields`; list endpoints of all objects accept the filter AST.

## Dependencies

M2-M5 (objects), M7 (CV text for candidate search).

## Acceptance criteria

1. Global search returns ranked, scoped results in <150ms P95 on the 10k seed.
2. Filter builder covers all field types incl. custom fields; nested AND/OR verified.
3. Saved view round-trips exactly (filters/sorts/columns/group-by); shared views visible
   workspace-wide; kanban views group correctly by any select field.
4. Admin creates a custom "Desired sector" select field on Candidate; it appears in
   forms, record page, table columns, filters, and CSV import mapping without code.
5. Cmd+K: any record reachable by typing; record-context actions execute.
6. Search index stays consistent after create/update/delete (event-driven refresh).

## Testing requirements

- Integration: query compiler golden tests (AST -> SQL incl. JSONB), search ranking
  smoke, view persistence, field definition validation.
- Playwright: build filter -> save view -> reload -> identical results; palette flows;
  keyboard-only record walk.

## Definition of Done

Standard checklist + tag `v0.9.0` + release "Milestone 8 - Search, Views & Custom
Fields". Roadmap marks **MVP complete**.

## Estimated complexity

XL. The query compiler and the field-type matrix (render x edit x filter x import) are
the two big blocks; consider sub-branches `feature/m8-fields`, `feature/m8-views`,
`feature/m8-search`.

## Explicitly OUT of scope

- Semantic/vector search (M13), Meilisearch upgrade (only if FTS misses targets, then via
  ADR), boolean query syntax for recruiters (post-1.0), custom objects (post-1.0)

## Issue breakdown

1. M8-01 Custom fields: schema + admin + renderers
2. M8-02 Filter AST + query compiler + tests
3. M8-03 Filter builder UI
4. M8-04 Saved views (model + UI + kanban grouping)
5. M8-05 FTS indexes + search service + global search UI
6. M8-06 Cmd+K palette + keyboard system
7. M8-07 Perf pass on 10k seed + P95 measurement
