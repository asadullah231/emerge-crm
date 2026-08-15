CREATE TYPE "public"."parse_job_status" AS ENUM('queued', 'parsing', 'parsed', 'confirmed', 'discarded', 'failed');--> statement-breakpoint
CREATE TABLE "parse_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"status" "parse_job_status" DEFAULT 'queued' NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"raw_text" text,
	"parsed" jsonb,
	"candidate_id" uuid,
	"error" text,
	"uploaded_by_id" uuid,
	"confirmed_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parse_jobs" ADD CONSTRAINT "parse_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parse_jobs" ADD CONSTRAINT "parse_jobs_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parse_jobs" ADD CONSTRAINT "parse_jobs_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parse_jobs" ADD CONSTRAINT "parse_jobs_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "parse_jobs_workspace_status_idx" ON "parse_jobs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "parse_jobs_workspace_sha_idx" ON "parse_jobs" USING btree ("workspace_id","sha256");--> statement-breakpoint
-- RLS (M7): workspace isolation, same pattern as 0002/0014. emerge_app grants
-- are inherited via ALTER DEFAULT PRIVILEGES from 0002.
ALTER TABLE "parse_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "parse_jobs"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);