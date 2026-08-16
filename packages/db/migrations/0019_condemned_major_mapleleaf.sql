CREATE TYPE "public"."feedback_recommendation" AS ENUM('strong_yes', 'yes', 'no', 'strong_no');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."interview_type" AS ENUM('screen', 'l1', 'l2', 'l3', 'l4', 'client', 'final', 'other');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('open', 'in_progress', 'done');--> statement-breakpoint
CREATE TABLE "interview_feedback" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"interview_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"author_user_id" uuid,
	"rating" integer NOT NULL,
	"recommendation" "feedback_recommendation" NOT NULL,
	"comments" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_participants" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"interview_id" uuid NOT NULL,
	"user_id" uuid,
	"contact_id" uuid,
	"role" text DEFAULT 'interviewer' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"human_id" text NOT NULL,
	"application_id" uuid NOT NULL,
	"type" "interview_type" DEFAULT 'screen' NOT NULL,
	"status" "interview_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_mins" integer DEFAULT 30 NOT NULL,
	"location" text,
	"meeting_link" text,
	"notes" text,
	"cancellation_reason" text,
	"sequence" integer DEFAULT 0 NOT NULL,
	"organizer_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"due_at" timestamp with time zone,
	"status" "task_status" DEFAULT 'open' NOT NULL,
	"assignee_id" uuid,
	"entity_type" text,
	"entity_id" uuid,
	"created_by_id" uuid,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_feedback" ADD CONSTRAINT "interview_feedback_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_participants" ADD CONSTRAINT "interview_participants_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interview_feedback_application_idx" ON "interview_feedback" USING btree ("workspace_id","application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_feedback_author_unique" ON "interview_feedback" USING btree ("interview_id","author_user_id");--> statement-breakpoint
CREATE INDEX "interview_participants_idx" ON "interview_participants" USING btree ("workspace_id","interview_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_participants_user_unique" ON "interview_participants" USING btree ("interview_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "interview_participants_contact_unique" ON "interview_participants" USING btree ("interview_id","contact_id");--> statement-breakpoint
CREATE INDEX "interviews_application_idx" ON "interviews" USING btree ("workspace_id","application_id");--> statement-breakpoint
CREATE INDEX "interviews_schedule_idx" ON "interviews" USING btree ("workspace_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "interviews_organizer_idx" ON "interviews" USING btree ("workspace_id","organizer_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("workspace_id","assignee_id","status");--> statement-breakpoint
CREATE INDEX "tasks_entity_idx" ON "tasks" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
-- RLS: workspace isolation (same pattern as 0002/0017/0018). emerge_app grants
-- are inherited via ALTER DEFAULT PRIVILEGES from 0002.
ALTER TABLE "interviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "interviews"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "interview_participants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "interview_participants"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "interview_feedback" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "interview_feedback"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "tasks"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);