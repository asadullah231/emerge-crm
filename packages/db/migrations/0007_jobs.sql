CREATE TYPE "public"."job_employment_type" AS ENUM('permanent', 'contract', 'temporary');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('open', 'on_hold', 'filled', 'cancelled', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."job_work_mode" AS ENUM('onsite', 'hybrid', 'remote');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"human_id" text NOT NULL,
	"title" text NOT NULL,
	"company_id" uuid NOT NULL,
	"hiring_contact_id" uuid,
	"owner_id" uuid,
	"status" "job_status" DEFAULT 'open' NOT NULL,
	"employment_type" "job_employment_type" DEFAULT 'permanent' NOT NULL,
	"work_mode" "job_work_mode" DEFAULT 'onsite' NOT NULL,
	"location" text,
	"description" text,
	"positions" integer DEFAULT 1 NOT NULL,
	"salary_text" text,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"salary_period" text,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_close_at" timestamp with time zone,
	"custom_fields" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_hiring_contact_id_contacts_id_fk" FOREIGN KEY ("hiring_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_workspace_idx" ON "jobs" USING btree ("workspace_id","deleted_at");--> statement-breakpoint
CREATE INDEX "jobs_workspace_status_idx" ON "jobs" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "jobs_workspace_company_idx" ON "jobs" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "jobs_workspace_title_idx" ON "jobs" USING btree ("workspace_id","title");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_workspace_human_id_unique" ON "jobs" USING btree ("workspace_id","human_id");