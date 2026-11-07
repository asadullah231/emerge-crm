CREATE TYPE "public"."rejection_source" AS ENUM('us', 'client');--> statement-breakpoint
ALTER TYPE "public"."application_stage" ADD VALUE 'shortlisted' BEFORE 'submitted';--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "rejected_by" "rejection_source";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "source" text;--> statement-breakpoint
UPDATE "application_statuses" SET "sort_order" = "sort_order" + 1 WHERE "sort_order" >= 3;