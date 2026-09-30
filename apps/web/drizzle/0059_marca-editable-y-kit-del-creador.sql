-- Marca editable de la instalación (borrador, historial y publicación atómica) y kit de marca de cada creador.
--
-- Aditiva e idempotente: solo crea tipos, tablas, índices y una columna que admite nulos; no cambia ni borra ninguna
-- fila. Volver a aplicarla no hace nada. Sin ninguna marca publicada, la instalación sigue con la marca de Escenara
-- tal cual, y las exportaciones existentes quedan sin kit (`brand_kit` nulo), igual que hasta ahora.
DO $$ BEGIN
  CREATE TYPE "public"."brand_asset_scope" AS ENUM('instalacion', 'kit');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."creator_kit_corner" AS ENUM('arriba-izquierda', 'arriba-derecha', 'abajo-izquierda', 'abajo-derecha');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."brand_version_state" AS ENUM('borrador', 'publicada', 'retirada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."brand_asset_kind" AS ENUM('logotipo', 'fuente', 'derivado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" "brand_asset_scope" NOT NULL,
	"kind" "brand_asset_kind" NOT NULL,
	"owner_id" uuid,
	"uploaded_by" uuid,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" text NOT NULL,
	"family" text,
	"license" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "brand_assets_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "brand_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"state" "brand_version_state" DEFAULT 'borrador' NOT NULL,
	"document" jsonb NOT NULL,
	"assets" jsonb DEFAULT '{"logos":{},"fuentes":[]}'::jsonb NOT NULL,
	"derived" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	CONSTRAINT "brand_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "creator_kits" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"logo_asset_id" uuid,
	"corner" "creator_kit_corner" DEFAULT 'arriba-derecha' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "montage_exports" ADD COLUMN IF NOT EXISTS "brand_kit" jsonb;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "brand_assets" ADD CONSTRAINT "brand_assets_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "brand_versions" ADD CONSTRAINT "brand_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "brand_versions" ADD CONSTRAINT "brand_versions_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "creator_kits" ADD CONSTRAINT "creator_kits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "creator_kits" ADD CONSTRAINT "creator_kits_logo_asset_id_brand_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."brand_assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "brand_assets_dueno_idx" ON "brand_assets" USING btree ("scope","owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brand_versions_una_publicada_uq" ON "brand_versions" USING btree ("state") WHERE "brand_versions"."state" = 'publicada';--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "brand_versions_un_borrador_uq" ON "brand_versions" USING btree ("state") WHERE "brand_versions"."state" = 'borrador';