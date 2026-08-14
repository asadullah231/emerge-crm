-- RLS for the M4 jobs table, following the pattern established in 0002.
-- Grants are inherited automatically via ALTER DEFAULT PRIVILEGES from 0002.

ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "jobs"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
