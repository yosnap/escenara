-- Lugares: el sitio poco conocido que el usuario reutiliza como escenario, con sus fotos (relación con la biblioteca),
-- sus versiones y su declaración de derechos; el lugar del proyecto, de la escena y del trabajo; y la comprobación de
-- coherencia «es el mismo lugar» (en sombra). Las declaraciones no se borran con el lugar (`set null` y su nombre).
--
-- Aditiva e idempotente: solo crea tipos, tablas, índices, columnas que admiten nulos o tienen valor por defecto y un
-- valor nuevo de un enumerado; no cambia ni borra ninguna fila. Volver a aplicarla no hace nada. Una escena anterior
-- queda sin lugar y heredando el del proyecto, que tampoco tiene ninguno: produce exactamente lo mismo que antes. Haz
-- copia de la base antes (`bun run db:backup`) y migra con el worker parado, como siempre.
DO $$ BEGIN
  CREATE TYPE "public"."place_space" AS ENUM('exterior', 'interior');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."place_photo_origin" AS ENUM('propias', 'con_permiso', 'generadas');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."place_origin" AS ENUM('fotos', 'generado', 'ilustracion_subida');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."place_reference_kind" AS ENUM('maestra', 'general', 'contraplano', 'detalle', 'zona');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."place_people_check" AS ENUM('sin_comprobar', 'ninguna', 'hay_personas');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."place_people_visible" AS ENUM('ninguna', 'no_reconocibles', 'retiradas');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."scene_place_shot" AS ENUM('con_reparto', 'solo_lugar');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TYPE "public"."coherence_check" ADD VALUE IF NOT EXISTS 'lugar_fiel';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid,
	"place_name" text DEFAULT '' NOT NULL,
	"photo_origin" "place_photo_origin" NOT NULL,
	"scope" "consent_scope" DEFAULT 'personal' NOT NULL,
	"space" "place_space" DEFAULT 'exterior' NOT NULL,
	"place_permission" boolean DEFAULT false NOT NULL,
	"people_visible" "place_people_visible" NOT NULL,
	"brands_visible" boolean DEFAULT false NOT NULL,
	"no_minors_declared" boolean NOT NULL,
	"text_version" text NOT NULL,
	"declared_by" uuid,
	"declared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text DEFAULT '' NOT NULL,
	CONSTRAINT "place_declarations_sin_menores" CHECK ("place_declarations"."no_minors_declared" = true),
	CONSTRAINT "place_declarations_interior_con_permiso" CHECK ("place_declarations"."space" = 'exterior' or "place_declarations"."place_permission" = true)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"kind" "place_reference_kind" NOT NULL,
	"origin" "reference_origin" DEFAULT 'foto_original' NOT NULL,
	"people_check" "place_people_check" DEFAULT 'sin_comprobar' NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_references_lugar_medio_uq" UNIQUE("place_id","media_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"place_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reference_media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference_kinds" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"master_media_id" uuid,
	"changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "place_versions_lugar_numero_uq" UNIQUE("place_id","number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "places" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"render_style" character_render_style DEFAULT 'realista' NOT NULL,
	"style_guide" jsonb DEFAULT '{"preset":"","prompt":"","paleta":"","trazo":"","detalle":"","referencias":[]}'::jsonb NOT NULL,
	"origin" "place_origin" DEFAULT 'fotos' NOT NULL,
	"current_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_dueno_nombre_uq" UNIQUE("owner_id","name"),
	CONSTRAINT "places_guia_solo_animado" CHECK ("places"."render_style" = 'animado' or "places"."style_guide"->>'preset' = '')
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN IF NOT EXISTS "place_id" uuid;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN IF NOT EXISTS "place_version" integer;
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "default_place_id" uuid;
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "place_id" uuid;
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "place_inherited" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "place_spot" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "place_shot" "scene_place_shot" DEFAULT 'con_reparto' NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "place_declarations" ADD CONSTRAINT "place_declarations_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "place_declarations" ADD CONSTRAINT "place_declarations_declared_by_users_id_fk" FOREIGN KEY ("declared_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "place_references" ADD CONSTRAINT "place_references_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "place_references" ADD CONSTRAINT "place_references_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "place_versions" ADD CONSTRAINT "place_versions_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "place_versions" ADD CONSTRAINT "place_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "places" ADD CONSTRAINT "places_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_declarations_lugar_idx" ON "place_declarations" USING btree ("place_id","declared_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "place_declarations_lugar_vigente_uq" ON "place_declarations" USING btree ("place_id") WHERE "place_declarations"."revoked_at" is null;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_references_lugar_idx" ON "place_references" USING btree ("place_id","sort_order");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_references_medio_idx" ON "place_references" USING btree ("media_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "place_references_una_maestra_uq" ON "place_references" USING btree ("place_id") WHERE "place_references"."kind" = 'maestra';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_versions_lugar_idx" ON "place_versions" USING btree ("place_id","number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "places_dueno_idx" ON "places" USING btree ("owner_id","updated_at");
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "projects" ADD CONSTRAINT "projects_default_place_id_places_id_fk" FOREIGN KEY ("default_place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "scenes" ADD CONSTRAINT "scenes_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_jobs_lugar_idx" ON "generation_jobs" USING btree ("place_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "projects_lugar_idx" ON "projects" USING btree ("default_place_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenes_lugar_idx" ON "scenes" USING btree ("place_id");
