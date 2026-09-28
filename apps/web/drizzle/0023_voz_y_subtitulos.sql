CREATE TYPE "public"."project_voice_mode" AS ENUM('clip', 'pista');--> statement-breakpoint
ALTER TYPE "public"."generation_job_kind" ADD VALUE 'voz';--> statement-breakpoint
CREATE TABLE "music_tracks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"rights_note" text NOT NULL,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"volume" real DEFAULT 0.2 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "credential_provider" NOT NULL,
	"model" text NOT NULL,
	"voice" text NOT NULL,
	"params_signature" text NOT NULL,
	"media_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_samples_usuario_voz_uq" UNIQUE("user_id","provider","model","voice","params_signature")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "voice_mode" "project_voice_mode" DEFAULT 'clip' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "voice_provider" "credential_provider";--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "voice_model" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "voice_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "voice_params" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "voice_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "voice_media_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "voice_job_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "voice_signature" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "voice_invalidation_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "transcript" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "subtitles" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "subtitles_edited_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_tracks" ADD CONSTRAINT "music_tracks_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_samples" ADD CONSTRAINT "voice_samples_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "music_tracks_proyecto_idx" ON "music_tracks" USING btree ("project_id","created_at");--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_voice_media_id_media_id_fk" FOREIGN KEY ("voice_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;