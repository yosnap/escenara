-- Registro de decisiones con su evidencia y evaluaciones en sombra.
--
-- Aditiva e idempotente: las evaluaciones del motor ganan cuatro columnas con valor por defecto (las anteriores se
-- quedan con la evidencia vacía y se leen igual que antes), el sujeto gana el valor «proyecto» y nace una tabla
-- nueva vacía. No se borra ninguna fila. Volver a aplicarla no hace nada.
--
-- Dos pasos de datos, también idempotentes y sin borrar ninguna decisión:
-- 1. los motivos y acciones ya guardados citaban entre «» a personas y productos: se sustituye cada cita que no sea
--    una de las fijas del motor por «nombre oculto» (la misma lista que `lib/decisiones.ts › CITAS_FIJAS`);
-- 2. las evaluaciones del montaje anteriores pasaron por la puerta de frenos duros, no por la de envío.
ALTER TYPE "public"."control_subject" ADD VALUE IF NOT EXISTS 'proyecto';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shadow_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_evaluation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid,
	"evaluator" text NOT NULL,
	"question" text NOT NULL,
	"questions_version" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"verdict" "coherence_verdict",
	"fit" real,
	"confidence" real,
	"threshold" real NOT NULL,
	"probabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"matches_effective" boolean,
	"input_hash" text DEFAULT '' NOT NULL,
	"reused_from" uuid,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_eur" real DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control_evaluations" ADD COLUMN IF NOT EXISTS "evidence" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "control_evaluations" ADD COLUMN IF NOT EXISTS "thresholds" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "control_evaluations" ADD COLUMN IF NOT EXISTS "gate" text DEFAULT 'envio' NOT NULL;--> statement-breakpoint
ALTER TABLE "control_evaluations" ADD COLUMN IF NOT EXISTS "action" text DEFAULT '' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shadow_evaluations" ADD CONSTRAINT "shadow_evaluations_control_evaluation_id_control_evaluations_id_fk" FOREIGN KEY ("control_evaluation_id") REFERENCES "public"."control_evaluations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "shadow_evaluations" ADD CONSTRAINT "shadow_evaluations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shadow_evaluations_decision_idx" ON "shadow_evaluations" USING btree ("control_evaluation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shadow_evaluations_pregunta_idx" ON "shadow_evaluations" USING btree ("question","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shadow_evaluations_huella_idx" ON "shadow_evaluations" USING btree ("user_id","question","input_hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shadow_evaluations_usuario_idx" ON "shadow_evaluations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "control_evaluations_fecha_idx" ON "control_evaluations" USING btree ("created_at");--> statement-breakpoint
UPDATE "control_evaluations" SET "rules" = (
  SELECT jsonb_agg(
    jsonb_set(
      jsonb_set(r, '{motivo}', to_jsonb(regexp_replace(COALESCE(r->>'motivo', ''), '«(?!(?:Tu cuenta|UGC a cámara|cantar con tu audio|Crear|Antes de generar|nombre oculto|el personaje|el producto|persona [0-9]+)»)[^»]*»', '«nombre oculto»', 'g'))),
      '{accion}', to_jsonb(regexp_replace(COALESCE(r->>'accion', ''), '«(?!(?:Tu cuenta|UGC a cámara|cantar con tu audio|Crear|Antes de generar|nombre oculto|el personaje|el producto|persona [0-9]+)»)[^»]*»', '«nombre oculto»', 'g'))
    ) ORDER BY n
  )
  FROM jsonb_array_elements("rules") WITH ORDINALITY AS e(r, n)
)
WHERE jsonb_typeof("rules") = 'array' AND jsonb_array_length("rules") > 0
  AND "rules"::text ~ '«(?!(?:Tu cuenta|UGC a cámara|cantar con tu audio|Crear|Antes de generar|nombre oculto|el personaje|el producto|persona [0-9]+)»)[^»]*»';--> statement-breakpoint
UPDATE "control_evaluations" SET "gate" = 'frenos' WHERE "subject" = 'montaje' AND "action" = '' AND "gate" <> 'frenos';
