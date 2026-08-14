-- RLS for M3 tenant tables, following the pattern established in 0002.
-- Grants are inherited automatically via ALTER DEFAULT PRIVILEGES from 0002.

ALTER TABLE "candidates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "candidates"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "candidate_education" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "candidate_education"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "candidate_experience" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "candidate_experience"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "attachments" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "attachments"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
--> statement-breakpoint
ALTER TABLE "counters" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "counters"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
