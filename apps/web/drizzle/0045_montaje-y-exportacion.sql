CREATE TYPE "public"."montage_export_state" AS ENUM('en_cola', 'en_curso', 'listo', 'fallido');--> statement-breakpoint
CREATE TYPE "public"."montage_export_stage" AS ENUM('preparando', 'normalizando', 'montando', 'guardando', 'listo');--> statement-breakpoint
CREATE TYPE "public"."montage_format" AS ENUM('vertical_9_16');--> statement-breakpoint
CREATE TYPE "public"."montage_subtitle_format" AS ENUM('srt', 'vtt');--> statement-breakpoint
CREATE TYPE "public"."montage_label_position" AS ENUM('arriba', 'abajo');--> statement-breakpoint
ALTER TYPE "public"."control_subject" ADD VALUE 'montaje';--> statement-breakpoint
CREATE TABLE "montage_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"montage_id" uuid NOT NULL,
	"montage_version" integer NOT NULL,
	"format" "montage_format" NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"result_media_id" uuid,
	"duration_seconds" real,
	"size_bytes" integer,
	"state" "montage_export_state" DEFAULT 'en_cola' NOT NULL,
	"stage" "montage_export_stage" DEFAULT 'preparando' NOT NULL,
	"progress" real DEFAULT 0 NOT NULL,
	"label_applied" boolean DEFAULT true NOT NULL,
	"label_position" "montage_label_position" DEFAULT 'abajo' NOT NULL,
	"burned_subtitles" boolean DEFAULT false NOT NULL,
	"subtitles_srt" text DEFAULT '' NOT NULL,
	"subtitles_vtt" text DEFAULT '' NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "montages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"fragments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"voice_volume" real DEFAULT 1 NOT NULL,
	"music_volume" real DEFAULT 1 NOT NULL,
	"burn_subtitles" boolean DEFAULT false NOT NULL,
	"subtitle_format" "montage_subtitle_format" DEFAULT 'srt' NOT NULL,
	"label_visible" boolean DEFAULT true NOT NULL,
	"label_position" "montage_label_position" DEFAULT 'abajo' NOT NULL,
	"format" "montage_format" DEFAULT 'vertical_9_16' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "montages_proyecto_uq" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "montage_exports" ADD CONSTRAINT "montage_exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "montage_exports" ADD CONSTRAINT "montage_exports_montage_id_montages_id_fk" FOREIGN KEY ("montage_id") REFERENCES "public"."montages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "montage_exports" ADD CONSTRAINT "montage_exports_result_media_id_media_id_fk" FOREIGN KEY ("result_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "montages" ADD CONSTRAINT "montages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "montage_exports_proyecto_idx" ON "montage_exports" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "montage_exports_cola_idx" ON "montage_exports" USING btree ("state","locked_until");--> statement-breakpoint
CREATE UNIQUE INDEX "montage_exports_montaje_version_uq" ON "montage_exports" USING btree ("montage_id","montage_version") WHERE "montage_exports"."state" <> 'fallido';--> statement-breakpoint
CREATE INDEX "montages_proyecto_idx" ON "montages" USING btree ("project_id");