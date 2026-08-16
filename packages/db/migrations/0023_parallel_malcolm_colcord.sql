CREATE TYPE "public"."report_cadence" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."report_format" AS ENUM('csv');--> statement-breakpoint
CREATE TABLE "report_schedules" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"report_key" text NOT NULL,
	"filters" jsonb,
	"cadence" "report_cadence" NOT NULL,
	"format" "report_format" DEFAULT 'csv' NOT NULL,
	"recipients" text[] NOT NULL,
	"hour_utc" integer DEFAULT 7 NOT NULL,
	"day_of_week" integer,
	"day_of_month" integer,
	"active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp with time zone,
	"next_run_at" timestamp with time zone NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_schedules_workspace_idx" ON "report_schedules" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "report_schedules_due_idx" ON "report_schedules" USING btree ("active","next_run_at");--> statement-breakpoint
-- RLS: workspace isolation (same pattern as 0002/0017-0022). emerge_app grants
-- are inherited via ALTER DEFAULT PRIVILEGES from 0002. The delivery worker runs
-- on the owner (RLS-bypassing) connection and scopes each sweep by workspace_id.
ALTER TABLE "report_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "report_schedules"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);
