CREATE TYPE "public"."character_render_style" AS ENUM('realista', 'animado');--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'estilo-animado';--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "render_style" character_render_style DEFAULT 'realista' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "style_guide" jsonb DEFAULT '{"preset":"","prompt":"","paleta":"","trazo":"","detalle":"","referencias":[]}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "master_frame_media_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "render_style" text DEFAULT 'realista' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_master_frame_media_id_media_id_fk" FOREIGN KEY ("master_frame_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_animado_solo_inventado" CHECK ("characters"."render_style" = 'realista' or "characters"."virtual" = true);--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_render_style_valido" CHECK ("projects"."render_style" in ('realista', 'animado'));