CREATE TYPE "public"."ai_provider" AS ENUM('anthropic', 'openai', 'openrouter', 'deepseek', 'google', 'groq', 'mistral', 'xai', 'openai_compatible');--> statement-breakpoint
CREATE TABLE "workspace_ai_settings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"provider" "ai_provider" DEFAULT 'anthropic' NOT NULL,
	"model" text NOT NULL,
	"base_url" text,
	"api_key_ciphertext" text,
	"api_key_iv" text,
	"api_key_tag" text,
	"api_key_last4" text,
	"updated_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_ai_settings" ADD CONSTRAINT "workspace_ai_settings_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_ai_settings" ADD CONSTRAINT "workspace_ai_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_ai_settings_workspace_unique" ON "workspace_ai_settings" USING btree ("workspace_id");--> statement-breakpoint
-- RLS: workspace isolation (same pattern as 0002/0014/0015).
ALTER TABLE "workspace_ai_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "workspace_ai_settings"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);