CREATE TYPE "public"."project_speech_accent" AS ENUM('es_ES_madrid', 'es_AR_rioplatense', 'es_CO_bogota', 'es_MX_cdmx', 'es_419_neutro');--> statement-breakpoint
CREATE TYPE "public"."scene_change_only" AS ENUM('ninguno', 'outfit', 'localizacion', 'pose');--> statement-breakpoint
CREATE TYPE "public"."character_identity_sheet_status" AS ENUM('candidata', 'por_defecto', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."scene_clip_format" AS ENUM('ugc_a_camara', 'voz_en_off');--> statement-breakpoint
CREATE TYPE "public"."scene_micro_action_timing" AS ENUM('antes', 'durante', 'despues');--> statement-breakpoint
CREATE TYPE "public"."scene_camera_level" AS ENUM('basico', 'variacion', 'avanzado');--> statement-breakpoint
CREATE TYPE "public"."generation_identity_reference" AS ENUM('vistas', 'hoja_3x3');--> statement-breakpoint
CREATE TYPE "public"."scene_aesthetic_register" AS ENUM('influencer', 'ugc_real');--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'formato-clip';--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'plano';--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'angulo';--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'optica';--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'luz';--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'localizacion';--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'camara';--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'microaccion';--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'registro-estetico';--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'anclajes';--> statement-breakpoint
ALTER TYPE "public"."coherence_check" ADD VALUE 'direccion_fiel';--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "beauty_opt_in" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "voice_axes" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "voice_preset_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "identity_sheet_media_id" uuid;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "identity_sheet_status" character_identity_sheet_status DEFAULT 'candidata' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "identity_sheet_trial" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "identity_reference_kind" "generation_identity_reference" DEFAULT 'vistas' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "speech_accent" "project_speech_accent" DEFAULT 'es_ES_madrid' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "clip_format" "scene_clip_format" DEFAULT 'ugc_a_camara' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "shot_type" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "camera_angle" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "camera_move" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "camera_level" "scene_camera_level" DEFAULT 'basico' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "micro_action" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "micro_action_timing" "scene_micro_action_timing" DEFAULT 'durante' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "dialogue_direction" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "light_preset" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "location_preset" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "optics_preset" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "aesthetic_register" "scene_aesthetic_register" DEFAULT 'ugc_real' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "reference_image_media_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "change_only" "scene_change_only" DEFAULT 'ninguno' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "change_only_base_frame_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "change_only_reference_media_id" uuid;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_identity_sheet_media_id_media_id_fk" FOREIGN KEY ("identity_sheet_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_reference_image_media_id_media_id_fk" FOREIGN KEY ("reference_image_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_change_only_base_frame_id_media_id_fk" FOREIGN KEY ("change_only_base_frame_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_change_only_reference_media_id_media_id_fk" FOREIGN KEY ("change_only_reference_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;