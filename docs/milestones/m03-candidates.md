# Milestone 3 - Candidates, CV Upload & Dedupe

- Version on completion: **v0.4.0**
- Status: In progress
- Complexity: **L**
- Depends on: M1 (auth/RLS), M2 (list engine + record primitives)

> Rewritten 14 Aug 2026 from the Zoho Recruit audit. Candidates are the product's
> most-used object (1,287 records, 72% via parser). This milestone builds the
> candidate object, its parsed education/experience sub-records, CV storage, and
> email dedupe with merge. Resume PARSING (auto-fill from a CV) is M7; here the
> shapes parsing will target are established and manually usable.

## Objective

A rich candidate profile that a sourcer can create, own, edit, dedupe and attach a
CV to, at 10k-record list performance, with the exact field shape the Zoho
migration (M8) and parser (M7) will populate.

## User value

Sourcers keep the whole candidate pool in Emerge: identity, profile, skills,
salary expectations, education/experience history, source, owner, and CV files.
Duplicate emails are caught with a merge path so the pool stays clean.

## Features included

- Candidate CRUD: first/last name, current title, current employer, total
  experience, skills (free text), primary + secondary email, phone + mobile,
  location (city/country), LinkedIn/website, desired salary (free text + optional
  structured min/max/currency), notice period, source
  (parser | manual | import | referral | api), owner (sourcer), custom_fields
  reserved, soft delete + 30-day trash restore.
- Human id per candidate (CAND-0001) from a per-workspace counter.
- Education sub-records (institution, degree, field, dates) and experience
  sub-records (company, title, dates, summary): 1:N, editable, parser-target shape.
- CV / document upload: S3-compatible storage (MinIO in dev), server-proxied
  multipart upload with mime + size validation, presigned GET for download,
  delete, listed with kind (cv | other) + size + date. The candidate's primary CV
  is an attachment with kind=cv.
- Dedupe: lowercased-email uniqueness surfaced as a non-blocking warning on
  create (like M2), plus a merge tool that folds a duplicate into a target
  (target wins on conflict, duplicate fills empties; sub-records + attachments
  re-parent; source candidate soft-deleted).
- Candidate list (M2 DataTable: search, sort, trash, source + human-id columns)
  and record page (profile inline editors, education/experience sections,
  documents panel, tags).
- Quick-create (name + email) for speed; full create modal for the rest.

## Database changes

- `candidates` (workspace-scoped, owner FK, source enum, human_id, structured
  salary fields, custom_fields jsonb, soft delete; indexes on
  (workspace, deleted), (workspace, lower(email)), (workspace, human_id)).
- `candidate_education` + `candidate_experience` (candidate FK cascade, ordered).
- `attachments` (polymorphic entity_type + entity_id, workspace-scoped, bucket +
  key, filename, mime, size, kind enum, uploaded_by, soft delete).
- `counters` (workspace_id + entity_type unique, value) for human-id allocation.
- RLS: ENABLE + `workspace_isolation` policy on every new table in the creation
  migration (M1 pattern; grants inherited from migration 0002).

## Backend changes

- `@emerge/storage`: thin S3 client (put, presigned get, delete) over
  `@aws-sdk/client-s3` + `s3-request-presigner`, reading S3_* env.
- Candidates router: list/get/create/update/softDelete/restore/duplicates/merge,
  plus education/experience sub-record mutations; human-id allocation inside the
  create transaction; audit log on every mutation.
- Attachments: Next route handler for upload (auth + workspace + size/mime guard),
  attachments router for list/delete + presigned-download URL.
- Counter helper: atomic `insert ... on conflict do update ... returning`.

## Frontend changes

- Candidate list + record pages from M2 primitives; source badge; documents panel
  (dropzone upload, download, delete); education/experience editable sections;
  merge dialog; quick-create.

## API changes

- Routers `candidates`, `attachments`. Route handler
  `POST /api/candidates/[id]/documents` (upload) and
  `GET /api/attachments/[id]/download` (redirect to presigned URL).

## Migration requirements

- No data migration in M3 (green-field tables). The field shape is fixed here so
  M8 (Zoho import) and M7 (parser) populate it without schema churn. Attachments
  are the target for imported CV files.

## Acceptance criteria

1. Candidate CRUD, permissions (read-only blocked from writes), soft delete +
   restore work per M2 patterns; human id assigned as CAND-0001, CAND-0002, ...
2. A PDF/DOCX under the size cap uploads, lists, downloads intact; an oversized
   file and a disallowed type are rejected server-side.
3. Two candidates with the same email are flagged on create (non-blocking); the
   merge tool folds one into the other with sub-records + attachments preserved
   and the source soft-deleted.
4. Education and experience rows can be added, edited and removed on the record.
5. List stays responsive at 10k candidates (seed provided).

## Testing requirements

- Unit: human-id formatting, salary/source validation, merge field-resolution.
- DB (CI): candidate RLS isolation, email dedupe query, counter atomicity,
  merge re-parenting, attachment RLS.
- Storage: upload validation (size/mime) unit-tested; round-trip in CI where S3
  is configured.

## Definition of Done

Standard release checklist + tag `v0.4.0` + GitHub release
"Milestone 3 - Candidates, CV Upload & Dedupe".

## Explicitly out of scope

- Resume parsing / auto-fill from CV (M7).
- Applications / pipeline (M5); candidates connect to jobs only via applications.
- Global search, saved views, bulk actions (M9); list has quick search only.
- Matching (M15), candidate portal (M16), formatted CV generation (post-1.0).
- Structured skill taxonomy (free-text skills for now).

## Issue breakdown

1. M3-01 Schema: candidates, education, experience, attachments, counters + RLS
2. M3-02 Candidates router + education/experience + dedupe/merge
3. M3-03 Storage service + attachments (upload proxy + presigned GET)
4. M3-04 Candidate list + record page + quick-create
5. M3-05 CSV import (candidates, day-one manual)
6. M3-06 Tests + seed + verify + release
