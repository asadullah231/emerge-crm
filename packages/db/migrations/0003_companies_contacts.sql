CREATE TYPE "public"."company_status" AS ENUM('prospect', 'active', 'dormant');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"website" text,
	"domain" text,
	"industry" text,
	"size" text,
	"location" text,
	"phone" text,
	"description" text,
	"status" "company_status" DEFAULT 'prospect' NOT NULL,
	"owner_id" uuid,
	"custom_fields" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid,
	"first_name" text,
	"last_name" text NOT NULL,
	"title" text,
	"email" text,
	"secondary_email" text,
	"work_phone" text,
	"mobile" text,
	"linkedin_url" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"owner_id" uuid,
	"custom_fields" jsonb,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taggings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taggings" ADD CONSTRAINT "taggings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "taggings" ADD CONSTRAINT "taggings_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_workspace_idx" ON "companies" USING btree ("workspace_id","deleted_at");--> statement-breakpoint
CREATE INDEX "companies_workspace_name_idx" ON "companies" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "companies_workspace_domain_idx" ON "companies" USING btree ("workspace_id","domain");--> statement-breakpoint
CREATE INDEX "contacts_workspace_idx" ON "contacts" USING btree ("workspace_id","deleted_at");--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "contacts_workspace_email_idx" ON "contacts" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "taggings_tag_entity_unique" ON "taggings" USING btree ("tag_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "taggings_entity_idx" ON "taggings" USING btree ("workspace_id","entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_name_unique" ON "tags" USING btree ("workspace_id","name");