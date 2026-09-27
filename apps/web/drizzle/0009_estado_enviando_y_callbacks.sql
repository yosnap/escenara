ALTER TYPE "public"."generation_job_state" ADD VALUE 'enviando';--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "excess_credits" integer;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "callback_token_hash" text;