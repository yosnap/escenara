ALTER TYPE "public"."project_voice_mode" ADD VALUE 'omni';--> statement-breakpoint
ALTER TYPE "public"."consent_holder" ADD VALUE 'inventado';--> statement-breakpoint
CREATE TABLE "character_omni_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"character_version_id" uuid NOT NULL,
	"audio_id" text NOT NULL,
	"remote_character_id" text NOT NULL,
	"remote_image_url" text DEFAULT '' NOT NULL,
	"remote_body_image_url" text DEFAULT '' NOT NULL,
	"portrait_media_id" uuid,
	"body_media_id" uuid,
	"credits_spent" real DEFAULT 0 NOT NULL,
	"registered_by" uuid,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "virtual" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "synthetic_declared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "omni_voice" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "omni_voice_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "omni_voice_example" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "omni_audio_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "omni_voice_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "character_omni_registrations" ADD CONSTRAINT "character_omni_registrations_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_omni_registrations" ADD CONSTRAINT "character_omni_registrations_character_version_id_character_versions_id_fk" FOREIGN KEY ("character_version_id") REFERENCES "public"."character_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_omni_registrations" ADD CONSTRAINT "character_omni_registrations_portrait_media_id_media_id_fk" FOREIGN KEY ("portrait_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_omni_registrations" ADD CONSTRAINT "character_omni_registrations_body_media_id_media_id_fk" FOREIGN KEY ("body_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_omni_registrations" ADD CONSTRAINT "character_omni_registrations_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_omni_registrations_personaje_idx" ON "character_omni_registrations" USING btree ("character_id","registered_at");--> statement-breakpoint
CREATE INDEX "character_omni_registrations_version_idx" ON "character_omni_registrations" USING btree ("character_version_id");