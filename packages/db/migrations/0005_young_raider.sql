CREATE TYPE "public"."attachment_kind" AS ENUM('cv', 'formatted_cv', 'other');--> statement-breakpoint
CREATE TYPE "public"."candidate_source" AS ENUM('parser', 'manual', 'import', 'referral', 'api');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"kind" "attachment_kind" DEFAULT 'other' NOT NULL,
	"bucket" text NOT NULL,
	"object_key" text NOT NULL,
	"filename" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_by_id" uuid,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_education" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"institution" text,
	"degree" text,
	"field_of_study" text,
	"start_year" integer,
	"end_year" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidate_experience" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"company" text,
	"title" text,
	"start_date" text,
	"end_date" text,
	"is_current" boolean DEFAULT false NOT NULL,
	"summary" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"human_id" text NOT NULL,
	"first_name" text,
	"last_name" text NOT NULL,
	"title" text,
	"current_employer" text,
	"email" text,
	"secondary_email" text,
	"phone" text,
	"mobile" text,
	"city" text,
	"country" text,
	"linkedin_url" text,
	"website_url" text,
	"skills" text,
	"experience_years" integer,
	"salary_text" text,
	"salary_min" integer,
	"salary_max" integer,
	"salary_currency" text,
	"notice_period" text,
	"source" "candidate_source" DEFAULT 'manual' NOT NULL,
	"owner_id" uuid,
	"custom_fields" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counters" ADD CONSTRAINT "counters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_entity_idx" ON "attachments" USING btree ("workspace_id","entity_type","entity_id","deleted_at");--> statement-breakpoint
CREATE INDEX "candidate_education_candidate_idx" ON "candidate_education" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidate_experience_candidate_idx" ON "candidate_experience" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "candidates_workspace_idx" ON "candidates" USING btree ("workspace_id","deleted_at");--> statement-breakpoint
CREATE INDEX "candidates_workspace_name_idx" ON "candidates" USING btree ("workspace_id","last_name");--> statement-breakpoint
CREATE INDEX "candidates_workspace_email_idx" ON "candidates" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_workspace_human_id_unique" ON "candidates" USING btree ("workspace_id","human_id");--> statement-breakpoint
CREATE UNIQUE INDEX "counters_workspace_entity_unique" ON "counters" USING btree ("workspace_id","entity_type");