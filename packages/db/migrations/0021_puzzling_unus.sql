CREATE TYPE "public"."email_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed', 'received');--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"category" text,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emails" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"direction" "email_direction" NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"from_addr" text NOT NULL,
	"to_addrs" text[] NOT NULL,
	"cc_addrs" text[],
	"subject" text NOT NULL,
	"body_html" text,
	"body_text" text,
	"message_id" text,
	"provider_id" text,
	"in_reply_to" text,
	"thread_token" text,
	"template_id" uuid,
	"sent_by_id" uuid,
	"sent_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_templates" ADD CONSTRAINT "email_templates_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_template_id_email_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."email_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emails" ADD CONSTRAINT "emails_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "email_templates_workspace_name_unique" ON "email_templates" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "emails_entity_idx" ON "emails" USING btree ("workspace_id","entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "emails_workspace_idx" ON "emails" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "emails_thread_token_idx" ON "emails" USING btree ("thread_token");--> statement-breakpoint
-- RLS: workspace isolation (same pattern as 0002/0017-0020). emerge_app grants
-- are inherited via ALTER DEFAULT PRIVILEGES from 0002. The inbound webhook
-- resolves the workspace on the owner (RLS-bypassing) connection first, then
-- writes inside withWorkspace, so these policies still hold for it.
ALTER TABLE "email_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "email_templates"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "emails" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "emails"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);