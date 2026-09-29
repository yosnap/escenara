CREATE TYPE "public"."scene_cast_format" AS ENUM('solo', 'podcast', 'dualcast');--> statement-breakpoint
CREATE TYPE "public"."scene_cast_side" AS ENUM('izquierda', 'derecha');--> statement-breakpoint
CREATE TYPE "public"."scene_cast_gaze" AS ENUM('camara', 'izquierda', 'derecha');--> statement-breakpoint
CREATE TYPE "public"."scene_cast_role" AS ENUM('hablante', 'acompanante');--> statement-breakpoint
CREATE TABLE "scene_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"role" "scene_cast_role" DEFAULT 'hablante' NOT NULL,
	"side" "scene_cast_side" DEFAULT 'izquierda' NOT NULL,
	"gaze_direction" "scene_cast_gaze" DEFAULT 'camara' NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scene_characters_escena_personaje_uq" UNIQUE("scene_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "scene_dialogue_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"character_id" uuid NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"direction" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scene_dialogue_turns_escena_orden_uq" UNIQUE("scene_id","sort_order")
);
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "cast_format" "scene_cast_format" DEFAULT 'solo' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "podcast_group_id" uuid;--> statement-breakpoint
ALTER TABLE "scene_characters" ADD CONSTRAINT "scene_characters_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_characters" ADD CONSTRAINT "scene_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_dialogue_turns" ADD CONSTRAINT "scene_dialogue_turns_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_dialogue_turns" ADD CONSTRAINT "scene_dialogue_turns_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scene_characters_escena_idx" ON "scene_characters" USING btree ("scene_id","sort_order");--> statement-breakpoint
CREATE INDEX "scene_characters_personaje_idx" ON "scene_characters" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "scene_dialogue_turns_escena_idx" ON "scene_dialogue_turns" USING btree ("scene_id","sort_order");--> statement-breakpoint
CREATE INDEX "scene_dialogue_turns_personaje_idx" ON "scene_dialogue_turns" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "scenes_grupo_podcast_idx" ON "scenes" USING btree ("podcast_group_id");--> statement-breakpoint
-- Relleno del reparto: hasta 0.27.0 el personaje de una escena era el protagonista de su proyecto y la escena no
-- guardaba ninguno. Cada escena de un proyecto con protagonista pasa a tener su fila de reparto como `hablante`,
-- a la izquierda y a cámara: exactamente lo que ya producía. Las escenas de un proyecto sin protagonista se
-- quedan sin reparto, que también es lo que tenían.
INSERT INTO "scene_characters" ("scene_id", "character_id", "role", "side", "gaze_direction", "sort_order")
SELECT "scenes"."id", "projects"."main_character_id", 'hablante', 'izquierda', 'camara', 1
FROM "scenes"
JOIN "projects" ON "projects"."id" = "scenes"."project_id"
WHERE "projects"."main_character_id" IS NOT NULL
ON CONFLICT ("scene_id", "character_id") DO NOTHING;