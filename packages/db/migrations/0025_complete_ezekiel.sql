ALTER TYPE "public"."job_status" ADD VALUE 'waiting_approval';--> statement-breakpoint
ALTER TYPE "public"."job_status" ADD VALUE 'declined';--> statement-breakpoint
ALTER TYPE "public"."job_status" ADD VALUE 'submitted_by_client';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "required_skills" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "is_hot" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "closed_at" timestamp with time zone;