# Milestone 3 - Candidates & CV Upload

- Version on completion: **v0.4.0**
- Status: Not started
- Complexity: **L**

## Objective

The core object of the product: rich candidate profiles with documents attached, plus a
basic CSV import so migrating agencies get their database in on day one.

## User value

Recruiters keep their entire candidate pool in one place: profile, CV files, tags, source,
work preferences; and can bring existing data with them.

## Features included

- Candidate CRUD: name, headline/current title, emails, phones, location, links
  (LinkedIn/portfolio), current company, desired salary range + currency, notice period,
  right-to-work flag, source (manual / referral / career portal / import), owner, tags,
  skills (free-form chip list v1)
- Document upload on the candidate: CV/cover letter/other, stored in MinIO/S3 via
  presigned upload, listed with type + upload date; download; delete. (Versioning and
  parsing arrive in M7; this is safe storage + association.)
- Candidate list with the M2 DataTable; candidate record page (3-column: profile /
  timeline placeholder / documents + future applications)
- CSV import v1 (candidates only): upload CSV, map columns to fields, dry-run preview
  with row-level errors, import with dedupe-by-email choice (skip/update)
- Quick-create (name + email + CV drop) for speed; GDPR fields present from day one:
  consent status + consent date (portal wiring in M9/M16)

## Database changes

`candidates` (custom_fields JSONB reserved), `documents` (polymorphic subject, S3 key,
kind, size, mime), reuse `tags`/`taggings`. Import bookkeeping table `imports` (status,
counts, error report key).

## Backend changes

Presigned-upload flow (content-type + size validation), import pipeline as a worker job
(streaming CSV parse, batched inserts, error report file), dedupe-by-email logic.

## Frontend changes

Candidate list + record page from M2 primitives; upload dropzone component; import wizard
(upload -> map -> preview -> run -> report); tag/skill chip editors.

## API changes

Routers `candidates`, `documents`, `imports`.

## Dependencies

M1 (M2 primitives strongly recommended; hard dependency is only M1).

## Acceptance criteria

1. Candidate CRUD + permissions + soft delete work as per M2 patterns.
2. A 5MB PDF uploads via presigned URL, downloads intact; a 50MB file and a .exe are
   rejected client- and server-side.
3. CSV import: a 5,000-row file imports in under 2 minutes with a per-row error report;
   dedupe-by-email skip/update both verified.
4. Quick-create produces a usable profile in under 10 seconds of user effort.
5. Record page shows documents and profile with inline editing.

## Testing requirements

- Integration: CRUD, upload validation, import happy path + malformed CSV + dupes.
- Playwright: quick-create with CV drop; import wizard end-to-end with fixture CSV.

## Definition of Done

Standard checklist + tag `v0.4.0` + release "Milestone 3 - Candidates".

## Estimated complexity

L. Import wizard and safe file handling carry the risk.

## Explicitly OUT of scope

- Resume parsing/auto-profile (M7), search beyond quick filter (M8), matching (M13)
- Candidate portal (M16), formatted/branded CV generation (M11)
- Structured skill taxonomy (chips only for now)

## Issue breakdown

1. M3-01 Schema: candidates, documents, imports
2. M3-02 Candidates router + list + record page
3. M3-03 Presigned upload + document management
4. M3-04 CSV import worker + wizard UI
5. M3-05 Quick-create flow
6. M3-06 Tests + fixtures
