CREATE TYPE "public"."submission_medium" AS ENUM('link', 'email', 'portal', 'other');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('submitted', 'approved', 'rejected', 'archived');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'submission_verdict';--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"human_id" text NOT NULL,
	"batch_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"company_id" uuid,
	"contact_id" uuid,
	"status" "submission_status" DEFAULT 'submitted' NOT NULL,
	"medium" "submission_medium" DEFAULT 'link' NOT NULL,
	"token_hash" text NOT NULL,
	"sent_by_id" uuid,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"note" text,
	"client_comment" text,
	"verdict_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "submissions_job_idx" ON "submissions" USING btree ("workspace_id","job_id");--> statement-breakpoint
CREATE INDEX "submissions_company_idx" ON "submissions" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "submissions_application_idx" ON "submissions" USING btree ("workspace_id","application_id");--> statement-breakpoint
CREATE INDEX "submissions_token_idx" ON "submissions" USING btree ("token_hash");--> statement-breakpoint
-- RLS: workspace isolation (same pattern as 0002/0016/0017). emerge_app grants
-- are inherited via ALTER DEFAULT PRIVILEGES from 0002.
ALTER TABLE "submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "submissions"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);