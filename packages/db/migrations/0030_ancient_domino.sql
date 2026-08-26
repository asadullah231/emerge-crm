CREATE TYPE "public"."note_kind" AS ENUM('note', 'call', 'meeting', 'other');--> statement-breakpoint
CREATE TYPE "public"."task_kind" AS ENUM('task', 'event', 'call');--> statement-breakpoint
CREATE TABLE "job_recruiters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "record_follows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "industry" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "work_experience" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "is_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "kind" "note_kind" DEFAULT 'note' NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "kind" "task_kind" DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "job_recruiters" ADD CONSTRAINT "job_recruiters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_recruiters" ADD CONSTRAINT "job_recruiters_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_recruiters" ADD CONSTRAINT "job_recruiters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_follows" ADD CONSTRAINT "record_follows_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "record_follows" ADD CONSTRAINT "record_follows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_recruiters_unique" ON "job_recruiters" USING btree ("job_id","user_id");--> statement-breakpoint
CREATE INDEX "job_recruiters_workspace_idx" ON "job_recruiters" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "record_follows_unique" ON "record_follows" USING btree ("user_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "record_follows_entity_idx" ON "record_follows" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
ALTER TABLE "job_recruiters" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "job_recruiters" USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid);--> statement-breakpoint
ALTER TABLE "record_follows" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "record_follows" USING ("workspace_id" = current_setting('app.workspace_id', true)::uuid);
