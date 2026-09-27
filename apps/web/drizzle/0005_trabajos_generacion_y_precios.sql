CREATE TYPE "public"."generation_job_state" AS ENUM('preparando', 'enviado', 'en_curso', 'listo', 'fallido', 'desconocido');--> statement-breakpoint
CREATE TYPE "public"."generation_job_kind" AS ENUM('fotograma', 'animacion');--> statement-breakpoint
CREATE TABLE "generation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" "generation_job_kind" NOT NULL,
	"provider" "credential_provider" NOT NULL,
	"model" text NOT NULL,
	"task_id" text,
	"state" "generation_job_state" DEFAULT 'preparando' NOT NULL,
	"provider_state" text,
	"prompt" text NOT NULL,
	"input" jsonb NOT NULL,
	"source_media_id" uuid,
	"result_media_id" uuid,
	"estimated_credits" integer NOT NULL,
	"consumed_credits" integer,
	"error_message" text,
	"rights_confirmed_at" timestamp with time zone,
	"parent_job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	"polled_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "generation_jobs_proveedor_tarea_uq" UNIQUE("provider","task_id")
);
--> statement-breakpoint
CREATE TABLE "model_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" "credential_provider" NOT NULL,
	"model" text NOT NULL,
	"unit" text NOT NULL,
	"credits" real NOT NULL,
	"source" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_prices_proveedor_modelo_unidad_uq" UNIQUE("provider","model","unit")
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_source_media_id_media_id_fk" FOREIGN KEY ("source_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_result_media_id_media_id_fk" FOREIGN KEY ("result_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_parent_job_id_generation_jobs_id_fk" FOREIGN KEY ("parent_job_id") REFERENCES "public"."generation_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_jobs_usuario_idx" ON "generation_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_jobs_estado_idx" ON "generation_jobs" USING btree ("state");
--> statement-breakpoint
-- Precios medidos en el prototipo de la 0.3.0 con la cuenta real (informe de la fase 03). Sin precio
-- registrado no se estima ni se gasta, así que la tabla nace sembrada.
INSERT INTO "model_prices" ("provider", "model", "unit", "credits", "source", "checked_at") VALUES
	('kie', 'nano-banana-2-lite', 'imagen', 4, 'Medido en el prototipo 0.3.0 con la cuenta de KIE del propietario', '2026-09-27T00:00:00Z'),
	('kie', 'veo3_lite', 'vídeo de 4 s', 60, 'Medido en el prototipo 0.3.0 con la cuenta de KIE del propietario', '2026-09-27T00:00:00Z')
ON CONFLICT ON CONSTRAINT "model_prices_proveedor_modelo_unidad_uq" DO NOTHING;
