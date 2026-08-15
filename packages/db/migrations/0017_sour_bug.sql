CREATE TABLE "saved_views" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"name" text NOT NULL,
	"filters" jsonb NOT NULL,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_views_ws_entity_idx" ON "saved_views" USING btree ("workspace_id","entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_views_ws_entity_name_unique" ON "saved_views" USING btree ("workspace_id","entity_type","name");--> statement-breakpoint
-- RLS: workspace isolation (same pattern as 0002/0014/0015/0016).
ALTER TABLE "saved_views" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_isolation" ON "saved_views"
  USING ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK ("workspace_id" = nullif(current_setting('app.workspace_id', true), '')::uuid);