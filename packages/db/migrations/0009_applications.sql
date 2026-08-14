CREATE TYPE "public"."application_stage" AS ENUM('screening', 'submitted', 'interview', 'offered', 'hired', 'rejected', 'archived');--> statement-breakpoint
CREATE TABLE "application_status_history" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"from_status_key" text,
	"to_status_key" text NOT NULL,
	"from_stage" "application_stage",
	"to_stage" "application_stage" NOT NULL,
	"actor_user_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_statuses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"stage" "application_stage" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_entry" boolean DEFAULT false NOT NULL,
	"is_terminal" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"human_id" text NOT NULL,
	"candidate_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"stage" "application_stage" DEFAULT 'screening' NOT NULL,
	"status_key" text DEFAULT 'associated' NOT NULL,
	"rejection_reason" text,
	"rating" integer,
	"owner_id" uuid,
	"source" text,
	"stage_entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"custom_fields" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_status_history" ADD CONSTRAINT "application_status_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_statuses" ADD CONSTRAINT "application_statuses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_status_history_idx" ON "application_status_history" USING btree ("workspace_id","application_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "application_statuses_workspace_key_unique" ON "application_statuses" USING btree ("workspace_id","key");--> statement-breakpoint
CREATE INDEX "applications_workspace_idx" ON "applications" USING btree ("workspace_id","deleted_at");--> statement-breakpoint
CREATE INDEX "applications_job_stage_idx" ON "applications" USING btree ("workspace_id","job_id","stage");--> statement-breakpoint
CREATE INDEX "applications_workspace_stage_idx" ON "applications" USING btree ("workspace_id","stage");--> statement-breakpoint
CREATE INDEX "applications_candidate_idx" ON "applications" USING btree ("workspace_id","candidate_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_workspace_candidate_job_unique" ON "applications" USING btree ("workspace_id","candidate_id","job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "applications_workspace_human_id_unique" ON "applications" USING btree ("workspace_id","human_id");