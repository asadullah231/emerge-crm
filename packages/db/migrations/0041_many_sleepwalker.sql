ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "monthly_target_placements" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "monthly_target_submissions" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "monthly_target_revenue" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "monthly_target_bd_replies" integer;
