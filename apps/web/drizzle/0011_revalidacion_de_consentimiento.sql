ALTER TYPE "public"."generation_job_failure" ADD VALUE 'consentimiento';--> statement-breakpoint
CREATE TABLE "consent_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" uuid,
	"character_id" uuid,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "references_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "media" ADD COLUMN "is_document" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_access_log" ADD CONSTRAINT "consent_access_log_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_access_log" ADD CONSTRAINT "consent_access_log_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_access_log_fecha_idx" ON "consent_access_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "consent_access_log_admin_idx" ON "consent_access_log" USING btree ("admin_id");