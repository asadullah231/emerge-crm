-- Row level security pattern (established in M1, applies to every future tenant table).
--
-- How it works:
--   * `emerge_app` is a NOLOGIN role subject to RLS (it owns nothing).
--   * Workspace-scoped request handlers run inside a transaction that does
--     `SET LOCAL ROLE emerge_app` + `SET LOCAL app.workspace_id = '<uuid>'`.
--   * Policies compare workspace_id to current_setting('app.workspace_id').
--     With no setting, current_setting(..., true) is NULL and no rows match.
--   * Auth-level operations (login, signup, session lookup) run as the table
--     owner, which bypasses RLS; those code paths scope queries explicitly.
--
-- Every future workspace-scoped table gets: ENABLE ROW LEVEL SECURITY plus a
-- `workspace_isolation` policy exactly like the ones below.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'emerge_app') THEN
    CREATE ROLE emerge_app NOLOGIN;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO emerge_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO emerge_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO emerge_app;
--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "workspaces"
  USING ("id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "memberships"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "invitations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "invitations"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "audit_log"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
