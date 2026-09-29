CREATE TYPE "public"."music_rights_kind" AS ENUM('propia', 'licenciada', 'hablado_propio');--> statement-breakpoint
ALTER TYPE "public"."model_capability" ADD VALUE 'audio_to_video' BEFORE 'text_generation';--> statement-breakpoint
ALTER TYPE "public"."scene_clip_format" ADD VALUE 'cantar';--> statement-breakpoint
CREATE TABLE "music_rights_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"kind" "music_rights_kind" NOT NULL,
	"license_reference" text DEFAULT '' NOT NULL,
	"accepted_text" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "singing_audio_media_id" uuid;--> statement-breakpoint
ALTER TABLE "music_rights_declarations" ADD CONSTRAINT "music_rights_declarations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "music_rights_declarations" ADD CONSTRAINT "music_rights_declarations_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "music_rights_declarations_usuario_medio_uq" ON "music_rights_declarations" USING btree ("user_id","media_id");--> statement-breakpoint
CREATE INDEX "music_rights_declarations_usuario_idx" ON "music_rights_declarations" USING btree ("user_id","accepted_at");--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_singing_audio_media_id_media_id_fk" FOREIGN KEY ("singing_audio_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;