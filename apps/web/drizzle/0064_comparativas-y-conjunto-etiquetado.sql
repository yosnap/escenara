-- Comparativas y calibración: la comparativa A/B de una escena (`comparisons`, con lo confirmado de cada alternativa
-- y la clave del trabajo que se encola con ella), el conjunto etiquetado derivado de las revisiones humanas
-- (`labeled_examples`: solo números y una etiqueta, sin texto, sin nombres y sin identificadores de usuario; se borra
-- en cascada con la opinión de la que sale) y cada cálculo de umbral con su muestra (`calibration_runs`).
--
-- Aditiva e idempotente: solo crea tablas, índices, restricciones y claves ajenas nuevas; no cambia ni borra ninguna
-- fila existente. Volver a aplicarla no hace nada. Haz copia de la base antes (`bun run db:backup`) y migra con el
-- worker parado, como siempre.
CREATE TABLE IF NOT EXISTS "calibration_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"proposed_threshold" real,
	"sufficient" boolean NOT NULL,
	"reason" text NOT NULL,
	"calibration_size" integer NOT NULL,
	"holdout_size" integer NOT NULL,
	"calibration_metrics" jsonb,
	"holdout_metrics" jsonb,
	"questions_version" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comparisons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"scene_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"alternatives" jsonb NOT NULL,
	"planned_runs" integer NOT NULL,
	"estimated_credits" integer NOT NULL,
	"chosen_job_id" uuid,
	"chosen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comparisons_usuario_idempotencia_uq" UNIQUE("user_id","idempotency_key"),
	CONSTRAINT "comparisons_ejecuciones_ck" CHECK ("comparisons"."planned_runs" between 1 and 2)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "labeled_examples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"shadow_evaluation_id" uuid,
	"coherence_decision_id" uuid,
	"fit" real NOT NULL,
	"confidence" real NOT NULL,
	"label" text NOT NULL,
	"label_independent" boolean NOT NULL,
	"partition" text NOT NULL,
	"questions_version" text NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labeled_examples_sombra_uq" UNIQUE("shadow_evaluation_id"),
	CONSTRAINT "labeled_examples_coherencia_uq" UNIQUE("coherence_decision_id"),
	CONSTRAINT "labeled_examples_origen_ck" CHECK (("labeled_examples"."shadow_evaluation_id" is null) <> ("labeled_examples"."coherence_decision_id" is null)),
	CONSTRAINT "labeled_examples_etiqueta_ck" CHECK ("labeled_examples"."label" in ('acepta', 'rechaza')),
	CONSTRAINT "labeled_examples_particion_ck" CHECK ("labeled_examples"."partition" in ('calibracion', 'retenido'))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "comparisons" ADD CONSTRAINT "comparisons_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "labeled_examples" ADD CONSTRAINT "labeled_examples_sombra_fk" FOREIGN KEY ("shadow_evaluation_id") REFERENCES "public"."shadow_evaluations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "labeled_examples" ADD CONSTRAINT "labeled_examples_coherencia_fk" FOREIGN KEY ("coherence_decision_id") REFERENCES "public"."coherence_decisions"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calibration_runs_pregunta_idx" ON "calibration_runs" USING btree ("question","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "comparisons_escena_idx" ON "comparisons" USING btree ("scene_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "labeled_examples_pregunta_idx" ON "labeled_examples" USING btree ("question","partition");