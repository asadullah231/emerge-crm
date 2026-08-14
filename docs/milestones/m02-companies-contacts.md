# Milestone 2 - Companies & Contacts

- Version on completion: **v0.3.0**
- Status: **Completed (v0.3.0, 14 Aug 2026)**
- Complexity: **M**

## Objective

The client side of the agency CRM: companies (clients) and their contacts, with the list
-> record-page UX pattern that every later object reuses.

## User value

Recruiters manage their client book: which companies they work with, who the hiring
contacts are, ownership, and current status.

## Features included

- Company CRUD: name, website, industry, size, location, phone, description, status
  (prospect / active client / dormant), owner (user), tags
- Contact CRUD: name, title, email(s), phone(s), company link, owner, tags; primary
  contact flag per company
- List views v1: sortable/paginated tables, quick text filter, column visibility
  (full Views engine arrives in M8; this is the interim table)
- Record pages using the canonical 3-column layout: left = profile fields (inline edit),
  middle = timeline placeholder (activates in M6), right = associations (contacts on
  company page, company on contact page)
- Duplicate warning on create (name/domain match for companies, email for contacts)
- Delete = soft delete with undo toast

## Database changes

`companies`, `contacts` (+ tag tables or a shared `tags`/`taggings` pair established here
for reuse), both with `custom_fields JSONB` reserved, owner FK, soft delete.

## Backend changes

Generic list-query helper (pagination/sort/filter) built once, reused by every object.
Duplicate-check service. Ownership assignment.

## Frontend changes

Reusable primitives that the whole product will use: DataTable (TanStack Table),
RecordPage 3-column scaffold, InlineField editors (text, select, phone, URL, tags),
EntityPicker (relation selector), create dialogs/panels.

## API changes

Routers `companies`, `contacts` with list/get/create/update/softDelete/restore.

## Dependencies

M1 (auth, permissions, workspace scoping).

## Acceptance criteria

1. Full CRUD on both objects respecting roles (Read-only cannot mutate).
2. Inline edit saves optimistically and rolls back visibly on server error.
3. Contact must belong to a company OR explicitly be marked independent; company page
   lists its contacts with primary flag.
4. Duplicate warning appears for an existing domain/email but never hard-blocks.
5. Soft-deleted records vanish from lists, restorable from a trash view within 30 days.
6. Lists paginate at 50/page and remain responsive at 10k seeded records.

## Testing requirements

- Integration: CRUD + permission matrix + duplicate logic + soft delete/restore.
- Playwright: create company -> add contact -> inline edit -> delete/undo.
- Seed script: 10k companies/contacts for perf sanity (used again by M8 search).

## Definition of Done

Standard checklist + tag `v0.3.0` + release "Milestone 2 - Companies & Contacts".

## Estimated complexity

M. The hidden work is the reusable DataTable/RecordPage/InlineField primitives; budget
most of the milestone there since M3-M5 reuse them wholesale.

## Explicitly OUT of scope

- Activity timeline content (M6), custom fields UI (M8), saved views (M8)
- Client portal, submissions, BD/deals pipeline (post-1.0)
- Company enrichment from external data sources

## Issue breakdown

1. M2-01 Schema + migrations (companies, contacts, tags)
2. M2-02 List-query helper + companies/contacts routers
3. M2-03 DataTable primitive + list pages
4. M2-04 RecordPage scaffold + inline editors
5. M2-05 Duplicate detection + soft delete/trash
6. M2-06 Tests + 10k seed script
