-- Tus datos: exportación de un proyecto a ZIP (lo prepara el worker y caduca sola), borrado de la cuenta con periodo
-- de gracia y registro, objetos del almacenamiento pendientes de borrar (con reintento), gasto agregado sin datos
-- personales de las cuentas borradas (con la parte no confirmada por el proveedor), prueba mínima y anónima de sus
-- consentimientos y declaraciones, y el proyecto y el personaje con los que se encoló cada trabajo
-- (`generation_jobs.project_id` y `requested_character_id`, sin clave ajena).
--
-- Aditiva e idempotente: solo crea tipos, tablas, índices, claves ajenas y columnas que admiten nulos; no cambia ni
-- borra ninguna fila. Volver a aplicarla no hace nada. Haz copia de la base antes (`bun run db:backup`) y migra con el
-- worker parado, como siempre.
DO $$ BEGIN
  CREATE TYPE "public"."account_deletion_state" AS ENUM('programado', 'cancelado', 'borrando_objetos', 'completado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."storage_deletion_state" AS ENUM('pendiente', 'fallido');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."project_export_state" AS ENUM('en_cola', 'preparando', 'lista', 'fallida', 'caducada');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."consent_evidence_kind" AS ENUM('personaje', 'lugar', 'musica', 'afirmacion');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"state" "account_deletion_state" DEFAULT 'programado' NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"rows_deleted_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"last_error" text DEFAULT '' NOT NULL,
	"orphan_objects" integer DEFAULT 0 NOT NULL,
	"deleted_objects" integer DEFAULT 0 NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "consent_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "consent_evidence_kind" NOT NULL,
	"scope" text DEFAULT '' NOT NULL,
	"text_version" text DEFAULT '' NOT NULL,
	"declared" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"declared_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"state" "project_export_state" DEFAULT 'en_cola' NOT NULL,
	"storage_key" text,
	"size_bytes" bigint,
	"media_count" integer DEFAULT 0 NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "storage_deletions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"storage_key" text NOT NULL,
	"origin" text NOT NULL,
	"account_deletion_id" uuid,
	"state" "storage_deletion_state" DEFAULT 'pendiente' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_deletions_storage_key_unique" UNIQUE("storage_key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "usage_aggregates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"month" date NOT NULL,
	"provider" "credential_provider" NOT NULL,
	"provider_name" text DEFAULT '' NOT NULL,
	"model" text NOT NULL,
	"entry_type" "usage_entry_type" NOT NULL,
	"credits" real DEFAULT 0 NOT NULL,
	"amount_eur" real DEFAULT 0 NOT NULL,
	"entries" integer DEFAULT 0 NOT NULL,
	"unconfirmed_credits" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN IF NOT EXISTS "project_id" uuid;
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN IF NOT EXISTS "requested_character_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "account_deletions" ADD CONSTRAINT "account_deletions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_exports" ADD CONSTRAINT "project_exports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "project_exports" ADD CONSTRAINT "project_exports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "storage_deletions" ADD CONSTRAINT "storage_deletions_account_deletion_id_account_deletions_id_fk" FOREIGN KEY ("account_deletion_id") REFERENCES "public"."account_deletions"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "account_deletions_cola_idx" ON "account_deletions" USING btree ("state","available_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "account_deletions_usuario_abierto_uq" ON "account_deletions" USING btree ("user_id") WHERE "account_deletions"."state" in ('programado', 'borrando_objetos');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "consent_evidence_tipo_idx" ON "consent_evidence" USING btree ("kind","declared_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_exports_usuario_idx" ON "project_exports" USING btree ("user_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_exports_proyecto_idx" ON "project_exports" USING btree ("project_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_exports_cola_idx" ON "project_exports" USING btree ("state","locked_until");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_exports_proyecto_viva_uq" ON "project_exports" USING btree ("project_id") WHERE "project_exports"."state" in ('en_cola', 'preparando');
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_deletions_cola_idx" ON "storage_deletions" USING btree ("state","next_attempt_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "storage_deletions_cuenta_idx" ON "storage_deletions" USING btree ("account_deletion_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "usage_aggregates_clave_uq" ON "usage_aggregates" USING btree ("month","provider","provider_name","model","entry_type");
