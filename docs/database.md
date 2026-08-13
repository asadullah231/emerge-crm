# Database

> This document grows milestone by milestone. Until M0 ships there is no live schema;
> this page records conventions and the planned entity map.

## Conventions

- PostgreSQL 16+. Migrations via Drizzle Kit; every migration reversible and committed.
- Every tenant-scoped table carries `workspace_id` (FK -> workspaces) with RLS enabled.
- Primary keys: UUID v7 (time-ordered). Timestamps: `created_at`, `updated_at` (UTC).
- Soft delete (`deleted_at`) on user-facing objects; hard delete only via the GDPR purge
  path.
- Custom field values: `custom_fields JSONB NOT NULL DEFAULT '{}'` with a GIN index on
  objects that support them (candidate, company, contact, job, application).
- Naming: snake_case tables and columns, singular FK names (`candidate_id`).

## Planned entity map (summary)

| Entity | Introduced | Notes |
|---|---|---|
| workspaces, users, memberships, roles, invitations, sessions | M1 | membership = user x workspace with role |
| companies, contacts | M2 | contact belongs to company; both have owner (user) |
| candidates, candidate_tags | M3 | JSONB custom_fields; source tracking |
| documents | M3 (basic), M7 (full) | S3 key, kind (cv, cover letter, formatted cv, other), version chain |
| jobs | M4 | belongs to company + hiring contact; status; openings count |
| pipelines, stages | M5 | default pipeline seeded; per-workspace custom pipelines |
| applications | M5 | candidate x job, current stage, rejected reason; unique (candidate, job) |
| application_stage_events | M5 | append-only stage history: time-in-stage analytics |
| events (domain event outbox) | M6 | polymorphic: type, actor, subject, payload JSONB |
| tasks, notes | M6 | polymorphic subject (any core record) |
| notifications | M6 | per-user read state, fed from events |
| parsed_profiles | M7 | structured resume data linked to candidate + source document |
| field_definitions | M8 | custom fields metadata per object type |
| views, view_filters, view_sorts | M8 | saved views: table/kanban, filter groups AND/OR |
| interviews, interview_feedback | M10 | linked to application; scorecards |
| calendar_connections, calendar_events | M10 | Google/Microsoft |
| offers | M11 | versioned; status chain draft -> sent -> accepted/declined |
| placements | M11 | fee model: percentage/fixed; start date; guarantee period |
| email_accounts, email_threads, email_messages | M12 | provider cursors; association to candidate/contact |
| email_templates | M12 | variables; workspace-scoped |
| candidate_embeddings, job_embeddings | M13 | pgvector |
| automation_rules, sequences, sequence_steps, sequence_enrollments | M14 | |
| webhooks, webhook_deliveries | M14 | |
| api_keys | M17 | hashed, scoped |
| portal_accounts | M16 | candidate portal auth, separate from users |

Detailed column listings are added here per milestone as migrations land.
