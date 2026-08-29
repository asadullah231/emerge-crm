ALTER TYPE "public"."notification_kind" ADD VALUE 'record_assigned';--> statement-breakpoint
ALTER TABLE "parse_jobs" ADD COLUMN "auto_confirm" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "parse_jobs" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "parse_jobs" ADD CONSTRAINT "parse_jobs_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;