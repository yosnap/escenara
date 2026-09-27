CREATE TYPE "public"."generation_job_stage" AS ENUM('preparando', 'enviado', 'en_curso', 'descargando', 'listo');--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "stage" "generation_job_stage";--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "approved_frame_media_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "approved_frame_job_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "clip_media_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "clip_job_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "retries_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "retry_budget" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "last_failure_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "changed_since_generation" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_approved_frame_media_id_media_id_fk" FOREIGN KEY ("approved_frame_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_clip_media_id_media_id_fk" FOREIGN KEY ("clip_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;