CREATE TYPE "public"."generation_job_failure" AS ENUM('temporal', 'credencial', 'saldo', 'contenido', 'limite', 'respuesta', 'interno', 'sin_acotar', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."usage_entry_type" AS ENUM('reserva', 'consumo', 'liberacion', 'ajuste');--> statement-breakpoint
ALTER TYPE "public"."generation_job_state" ADD VALUE 'en_cola';--> statement-breakpoint
ALTER TYPE "public"."generation_job_state" ADD VALUE 'esperando_limite';--> statement-breakpoint
ALTER TYPE "public"."generation_job_state" ADD VALUE 'cancelado';--> statement-breakpoint
CREATE TABLE "queue_workers" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid,
	"provider" "credential_provider" NOT NULL,
	"model" text NOT NULL,
	"entry_type" "usage_entry_type" NOT NULL,
	"credits" real NOT NULL,
	"amount_eur" real,
	"informed" boolean DEFAULT false NOT NULL,
	"price_version" integer,
	"price_stamp" text,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "failure_reason" "generation_job_failure";--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "available_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "locked_by" text;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "reservation_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "credit_limit" integer;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_job_id_generation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD CONSTRAINT "usage_ledger_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_ledger_trabajo_apunte_uq" ON "usage_ledger" USING btree ("job_id","entry_type") WHERE "usage_ledger"."entry_type" <> 'ajuste';--> statement-breakpoint
CREATE INDEX "usage_ledger_usuario_idx" ON "usage_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_ledger_trabajo_idx" ON "usage_ledger" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "generation_jobs_cola_idx" ON "generation_jobs" USING btree ("state","available_at","priority");--> statement-breakpoint
CREATE INDEX "generation_jobs_toma_idx" ON "generation_jobs" USING btree ("locked_until");--> statement-breakpoint
-- Arreglo del JSON doblemente codificado heredado de 0.8.0: Drizzle enviaba el valor ya pasado por
-- `JSON.stringify` y `Bun.SQL` lo volvía a codificar, así que estas columnas guardaban un `jsonb` de tipo
-- `string` con el JSON dentro y no se podía consultar dentro del valor.
--
-- Se desenvuelve **una sola vez**, con una marca propia en `settings`: aunque este bloque se ejecutara otra
-- vez (una restauración a medias, una copia manual), no volvería a tocar nada. `IS JSON` es la segunda red y
-- exige PostgreSQL 16 o superior, que es lo que pide el proyecto (PostgreSQL 18 en Docker Compose).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "settings" WHERE "key" = '_jsonbDesenvuelto0008') THEN
    RETURN;
  END IF;
  UPDATE "settings" SET "value" = ("value" #>> '{}')::jsonb
  WHERE jsonb_typeof("value") = 'string' AND ("value" #>> '{}') IS JSON;
  UPDATE "generation_jobs" SET "input" = ("input" #>> '{}')::jsonb
  WHERE jsonb_typeof("input") = 'string' AND ("input" #>> '{}') IS JSON;
  -- Los trabajos que ya estaban en marcha antes de la cola no tienen worker que los tome: se dejan tal cual
  -- (el worker los sigue consultando por su `task_id`) y solo se marca su disponibilidad.
  UPDATE "generation_jobs" SET "available_at" = "created_at";
  INSERT INTO "settings" ("key", "value") VALUES ('_jsonbDesenvuelto0008', 'true'::jsonb);
END $$;
