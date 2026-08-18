ALTER TYPE "public"."attachment_kind" ADD VALUE 'job_description';--> statement-breakpoint
ALTER TYPE "public"."attachment_kind" ADD VALUE 'client_meeting_summary';--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "client_call_summary" text;