# Milestone 4 - Jobs

- Version on completion: **v0.5.0**
- Status: Not started
- Complexity: **M**

## Objective

Job (job order) management tied to client companies, mirroring the OpenCATS
joborder -> company/contact model with modern ergonomics.

## User value

Recruiters track every open role: which client it belongs to, who the hiring contact is,
terms, status, and how many openings remain.

## Features included

- Job CRUD: title, client company (required), hiring contact, description (rich text),
  location + remote policy, employment type (perm/contract), salary/rate range, fee
  basis (percentage/fixed, editable per job), openings count, priority, status
  (draft / open / on hold / filled / closed / lost), owner + optional co-owner,
  target start date, tags
- Job list (filter by status/company/owner) and job record page: left = details,
  middle = timeline placeholder, right = client + contact + future applications panel
- Job statuses drive visibility: only `open` jobs will be publishable to the career
  portal later (flag reserved: `publish_to_portal`, UI ships in M9)
- Clone job (agencies re-run similar roles constantly)

## Database changes

`jobs` (company FK, contact FK, custom_fields JSONB reserved, soft delete).

## Backend changes

`jobs` router; status transition validation (e.g. filled requires placements later; for
now free transitions with history recorded once M6 events exist).

## Frontend changes

Job list/record pages from M2 primitives; rich-text editor component (reused later by
notes/emails); clone action.

## API changes

Router `jobs` with list/get/create/update/softDelete/clone.

## Dependencies

M2 (companies + contacts must exist to own a job).

## Acceptance criteria

1. Job cannot be created without a client company; hiring contact restricted to that
   company's contacts.
2. CRUD + permissions + soft delete per established patterns.
3. Company record page right panel lists its jobs; contact page lists jobs where they
   are hiring contact.
4. Clone produces a draft copy (minus status history) in one click.
5. Rich-text description round-trips safely (sanitized HTML).

## Testing requirements

- Integration: CRUD, company/contact constraint, clone, sanitization.
- Playwright: create client -> contact -> job -> clone chain.

## Definition of Done

Standard checklist + tag `v0.5.0` + release "Milestone 4 - Jobs".

## Estimated complexity

M.

## Explicitly OUT of scope

- Applications/pipeline (M5), career portal publishing (M9), matching (M13)
- Job approval chains (corporate-HR feature, post-1.0)
- Multiposting to job boards (post-1.0; Indeed feed in M9)

## Issue breakdown

1. M4-01 Schema + jobs router
2. M4-02 Job list + record page
3. M4-03 Rich-text editor component + sanitization
4. M4-04 Clone + status rules
5. M4-05 Tests
