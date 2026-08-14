CREATE TYPE "public"."import_record_action" AS ENUM('created', 'updated', 'linked', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_run_mode" AS ENUM('dry_run', 'import', 'delta');--> statement-breakpoint
CREATE TYPE "public"."import_run_status" AS ENUM('running', 'completed', 'failed', 'rolled_back');--> statement-breakpoint
CREATE TABLE "external_refs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" text DEFAULT 'zoho' NOT NULL,
	"entity_type" text NOT NULL,
	"external_id" text NOT NULL,
	"internal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"external_id" text NOT NULL,
	"action" "import_record_action" NOT NULL,
	"internal_id" uuid,
	"error" text,
	"payload_hash" text,
	"pre_image" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" text DEFAULT 'zoho' NOT NULL,
	"mode" "import_run_mode" NOT NULL,
	"scope" text DEFAULT 'all' NOT NULL,
	"status" "import_run_status" DEFAULT 'running' NOT NULL,
	"stats" jsonb,
	"snapshot_dir" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_refs" ADD CONSTRAINT "external_refs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_records" ADD CONSTRAINT "import_records_run_id_import_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."import_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_refs_lookup_unique" ON "external_refs" USING btree ("workspace_id","source","entity_type","external_id");--> statement-breakpoint
CREATE INDEX "external_refs_internal_idx" ON "external_refs" USING btree ("workspace_id","entity_type","internal_id");--> statement-breakpoint
CREATE INDEX "import_records_run_idx" ON "import_records" USING btree ("run_id","entity_type");--> statement-breakpoint
CREATE INDEX "import_records_external_idx" ON "import_records" USING btree ("workspace_id","entity_type","external_id");--> statement-breakpoint
CREATE INDEX "import_runs_workspace_idx" ON "import_runs" USING btree ("workspace_id","started_at");