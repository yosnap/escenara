ALTER TABLE "characters" ADD COLUMN "omni_voice" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "omni_voice_description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "omni_voice_example" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "omni_audio_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "omni_voice_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "continuity_bible" jsonb DEFAULT '{"lugar":"","vestuario":{},"planos":[]}'::jsonb NOT NULL;