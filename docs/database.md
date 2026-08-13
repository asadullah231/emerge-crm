# Database

> This document grows milestone by milestone.

## Conventions

- PostgreSQL 16+. Migrations via Drizzle Kit; every migration reversible and committed.
- Every tenant-scoped table carries `workspace_id` (FK -> workspaces) with RLS enabled.
- Primary keys: UUID v7 (time-ordered). Timestamps: `created_at`, `updated_at` (UTC).
- Soft delete (`deleted_at`) on user-facing objects; hard delete only via the GDPR purge
  path.
- Custom field values: `custom_fields JSONB NOT NULL DEFAULT '{}'` with a GIN index on
  objects that support them (candidate, company, contact, job, application).
- Naming: snake_case tables and columns, singular FK names (`candidate_id`).

## Row level security pattern (established in M1)

Every workspace-scoped table ships with RLS enabled and a `workspace_isolation` policy:

- `emerge_app` is a NOLOGIN role created in migration `0002_rls_policies`; it owns nothing,
  so RLS applies to it. Grants cover CRUD on all current and future public tables.
- Workspace-scoped request handlers run inside `withWorkspace(db, workspaceId, fn)`
  (packages/db): a transaction that does `SET LOCAL ROLE emerge_app` +
  `SET LOCAL app.workspace_id = '<uuid>'`. Policies compare `workspace_id` to
  `current_setting('app.workspace_id', true)`; with no setting, nothing matches.
- Auth-level operations (login, signup, session lookup, invitation acceptance) run as the
  table owner (bypasses RLS) and scope queries explicitly. These paths are few and audited.
- New tenant tables MUST add: `ENABLE ROW LEVEL SECURITY` + a `workspace_isolation` policy
  (`USING` + `WITH CHECK` on `workspace_id`), in the same migration that creates the table.

## Live schema

### M1 (auth, workspaces, users)

| Table                   | Purpose                                               | Key columns                                                                                                         |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `users`                 | Global accounts (an account can join many workspaces) | `email` (unique, lowercased), `password_hash` (argon2id), `name`, `avatar_url`, `timezone`                          |
| `workspaces`            | Tenants                                               | `name`, `logo_url`                                                                                                  |
| `memberships`           | user x workspace x role; RLS                          | `role` enum (`admin`, `recruiter`, `readonly`), `deactivated_at` (deactivation is per-workspace)                    |
| `invitations`           | Pending invites; RLS                                  | `email`, `role`, `token_hash` (SHA-256, raw token never stored), `expires_at` (7 days), `accepted_at`, `revoked_at` |
| `sessions`              | DB-backed browser sessions                            | `token_hash` (SHA-256), `workspace_id` (the workspace the session acts in), `expires_at` (30 days)                  |
| `password_reset_tokens` | Single-use reset tokens                               | `token_hash`, `expires_at` (1 hour), `used_at`                                                                      |
| `audit_log`             | Auth + membership events; RLS                         | `actor_user_id`, `action`, `target_type`, `target_id`, `meta` JSONB                                                 |

## Planned entity map (summary)

| Entity                                                            | Introduced            | Notes                                                                    |
| ----------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| workspaces, users, memberships, invitations, sessions (live)      | M1                    | membership = user x workspace with role; see "Live schema" above         |
| companies, contacts                                               | M2                    | contact belongs to company; both have owner (user)                       |
| candidates, candidate_tags                                        | M3                    | JSONB custom_fields; source tracking                                     |
| documents                                                         | M3 (basic), M7 (full) | S3 key, kind (cv, cover letter, formatted cv, other), version chain      |
| jobs                                                              | M4                    | belongs to company + hiring contact; status; openings count              |
| pipelines, stages                                                 | M5                    | default pipeline seeded; per-workspace custom pipelines                  |
| applications                                                      | M5                    | candidate x job, current stage, rejected reason; unique (candidate, job) |
| application_stage_events                                          | M5                    | append-only stage history: time-in-stage analytics                       |
| events (domain event outbox)                                      | M6                    | polymorphic: type, actor, subject, payload JSONB                         |
| tasks, notes                                                      | M6                    | polymorphic subject (any core record)                                    |
| notifications                                                     | M6                    | per-user read state, fed from events                                     |
| parsed_profiles                                                   | M7                    | structured resume data linked to candidate + source document             |
| field_definitions                                                 | M8                    | custom fields metadata per object type                                   |
| views, view_filters, view_sorts                                   | M8                    | saved views: table/kanban, filter groups AND/OR                          |
| interviews, interview_feedback                                    | M10                   | linked to application; scorecards                                        |
| calendar_connections, calendar_events                             | M10                   | Google/Microsoft                                                         |
| offers                                                            | M11                   | versioned; status chain draft -> sent -> accepted/declined               |
| placements                                                        | M11                   | fee model: percentage/fixed; start date; guarantee period                |
| email_accounts, email_threads, email_messages                     | M12                   | provider cursors; association to candidate/contact                       |
| email_templates                                                   | M12                   | variables; workspace-scoped                                              |
| candidate_embeddings, job_embeddings                              | M13                   | pgvector                                                                 |
| automation_rules, sequences, sequence_steps, sequence_enrollments | M14                   |                                                                          |
| webhooks, webhook_deliveries                                      | M14                   |                                                                          |
| api_keys                                                          | M17                   | hashed, scoped                                                           |
| portal_accounts                                                   | M16                   | candidate portal auth, separate from users                               |

Detailed column listings are added here per milestone as migrations land.
