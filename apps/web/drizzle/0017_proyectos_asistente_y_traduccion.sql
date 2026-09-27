CREATE TYPE "public"."claim_state" AS ENUM('por_verificar', 'verificada', 'corregida', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."assistant_run_state" AS ENUM('reservado', 'listo', 'fallido');--> statement-breakpoint
CREATE TYPE "public"."scene_state" AS ENUM('borrador', 'aprobada', 'producida');--> statement-breakpoint
CREATE TYPE "public"."project_state" AS ENUM('borrador', 'planificado', 'en_produccion', 'listo');--> statement-breakpoint
CREATE TYPE "public"."project_format" AS ENUM('reel_vertical', 'corto', 'anuncio', 'explicativo');--> statement-breakpoint
CREATE TYPE "public"."claim_kind" AS ENUM('cifra', 'dato', 'salud', 'resultado');--> statement-breakpoint
CREATE TYPE "public"."assistant_run_kind" AS ENUM('concepto', 'guion', 'storyboard', 'traduccion');--> statement-breakpoint
CREATE TABLE "assistant_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"kind" "assistant_run_kind" NOT NULL,
	"provider" "credential_provider" NOT NULL,
	"model" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"state" "assistant_run_state" DEFAULT 'reservado' NOT NULL,
	"estimated_credits" real NOT NULL,
	"consumed_credits" real,
	"price_stamp" text DEFAULT '' NOT NULL,
	"scenes_proposed" integer DEFAULT 0 NOT NULL,
	"excess_credits" real,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "assistant_runs_usuario_idempotencia_uq" UNIQUE("user_id","idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"text" text NOT NULL,
	"kind" "claim_kind" NOT NULL,
	"state" "claim_state" DEFAULT 'por_verificar' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "claims_escena_texto_uq" UNIQUE("scene_id","text")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"format" "project_format" DEFAULT 'reel_vertical' NOT NULL,
	"state" "project_state" DEFAULT 'borrador' NOT NULL,
	"idea" text DEFAULT '' NOT NULL,
	"concept" text DEFAULT '' NOT NULL,
	"main_character_id" uuid,
	"authorized_credits" integer DEFAULT 0 NOT NULL,
	"plan_approved_by" uuid,
	"plan_approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"script_text" text DEFAULT '' NOT NULL,
	"action" text DEFAULT '' NOT NULL,
	"planned_seconds" integer DEFAULT 4 NOT NULL,
	"state" "scene_state" DEFAULT 'borrador' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"approved_frame_model" text DEFAULT '' NOT NULL,
	"approved_animation_model" text DEFAULT '' NOT NULL,
	"approved_frame_stamp" text DEFAULT '' NOT NULL,
	"approved_animation_stamp" text DEFAULT '' NOT NULL,
	"approved_character_version_id" uuid,
	"approved_template_version_id" uuid,
	"estimated_credits" real DEFAULT 0 NOT NULL,
	"invalidation_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scenes_proyecto_orden_uq" UNIQUE("project_id","sort_order")
);
--> statement-breakpoint
CREATE TABLE "translation_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_hash" text NOT NULL,
	"target" text NOT NULL,
	"character_id" uuid,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"used_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_cache_usuario_huella_uq" UNIQUE("user_id","source_hash")
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "scene_id" uuid;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD COLUMN "assistant_run_id" uuid;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD CONSTRAINT "assistant_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_main_character_id_characters_id_fk" FOREIGN KEY ("main_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_plan_approved_by_users_id_fk" FOREIGN KEY ("plan_approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_approved_character_version_id_character_versions_id_fk" FOREIGN KEY ("approved_character_version_id") REFERENCES "public"."character_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_approved_template_version_id_prompt_template_versions_id_fk" FOREIGN KEY ("approved_template_version_id") REFERENCES "public"."prompt_template_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_cache" ADD CONSTRAINT "translation_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translation_cache" ADD CONSTRAINT "translation_cache_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_runs_proyecto_idx" ON "assistant_runs" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "claims_escena_idx" ON "claims" USING btree ("scene_id","created_at");--> statement-breakpoint
CREATE INDEX "projects_usuario_idx" ON "projects" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "scenes_proyecto_idx" ON "scenes" USING btree ("project_id","sort_order");--> statement-breakpoint
CREATE INDEX "translation_cache_uso_idx" ON "translation_cache" USING btree ("used_at");--> statement-breakpoint
CREATE INDEX "translation_cache_personaje_idx" ON "translation_cache" USING btree ("character_id");--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_jobs_escena_idx" ON "generation_jobs" USING btree ("scene_id");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_ledger_ejecucion_apunte_uq" ON "usage_ledger" USING btree ("assistant_run_id","entry_type") WHERE "usage_ledger"."entry_type" <> 'ajuste';--> statement-breakpoint
CREATE INDEX "usage_ledger_ejecucion_idx" ON "usage_ledger" USING btree ("assistant_run_id");--> statement-breakpoint
-- Desde la 0.17.0 una escena pertenece siempre a un proyecto. Los trabajos sueltos de 0.10.0/0.12.0 se agrupan en
-- un proyecto «Sin título» por usuario, con **una escena por fotograma** (un clip no es una escena aparte: es la
-- animación del fotograma de su escena, y hereda la suya). Nada se borra y nada se recalcula: el prompt que se
-- envió de verdad sigue en `generation_jobs.prompt`.
--
-- Todo lo que sigue se acota por la `idea` que solo tienen los proyectos que crea esta migración, no por el
-- título: alguien puede llamar «Sin título» a un proyecto suyo y no tiene por qué salir tocado de aquí.
DROP TABLE IF EXISTS "_migracion_0017_escenas";--> statement-breakpoint
INSERT INTO "projects" ("user_id", "title", "format", "state", "idea")
SELECT DISTINCT j."user_id", 'Sin título', 'reel_vertical'::"project_format", 'en_produccion'::"project_state",
	'Trabajos creados antes de la 0.17.0, cuando «Crear» no necesitaba proyecto.'
FROM "generation_jobs" j
WHERE NOT EXISTS (
	SELECT 1 FROM "projects" p
	WHERE p."user_id" = j."user_id"
		AND p."idea" = 'Trabajos creados antes de la 0.17.0, cuando «Crear» no necesitaba proyecto.'
);--> statement-breakpoint
-- Tabla de apoyo: hace falta para poder enlazar cada trabajo con la escena que se acaba de crear para él.
CREATE TEMP TABLE "_migracion_0017_escenas" AS
SELECT j."id" AS job_id, p."id" AS project_id, j."created_at" AS creado, j."state" AS estado,
	COALESCE(j."input" ->> 'escena', '') AS escena,
	row_number() OVER (PARTITION BY j."user_id" ORDER BY j."created_at", j."id") AS orden
FROM "generation_jobs" j
JOIN "projects" p
	ON p."user_id" = j."user_id"
	AND p."idea" = 'Trabajos creados antes de la 0.17.0, cuando «Crear» no necesitaba proyecto.'
-- Solo los fotogramas: un clip hereda la escena de su padre en el paso siguiente.
WHERE j."parent_job_id" IS NULL;--> statement-breakpoint
INSERT INTO "scenes" ("project_id", "sort_order", "script_text", "state", "created_at", "updated_at")
SELECT m.project_id, m.orden, left(m.escena, 600),
	CASE WHEN m.estado = 'listo' THEN 'producida'::"scene_state" ELSE 'borrador'::"scene_state" END,
	m.creado, m.creado
FROM "_migracion_0017_escenas" m;--> statement-breakpoint
UPDATE "generation_jobs" j SET "scene_id" = s."id"
FROM "_migracion_0017_escenas" m
JOIN "scenes" s ON s."project_id" = m.project_id AND s."sort_order" = m.orden
WHERE j."id" = m.job_id;--> statement-breakpoint
-- Un clip es la animación del fotograma de su escena: hereda la del padre.
UPDATE "generation_jobs" h SET "scene_id" = p."scene_id"
FROM "generation_jobs" p
WHERE h."parent_job_id" = p."id" AND p."scene_id" IS NOT NULL AND h."scene_id" IS DISTINCT FROM p."scene_id";--> statement-breakpoint
DROP TABLE IF EXISTS "_migracion_0017_escenas";--> statement-breakpoint
-- Un proyecto heredado cuyos trabajos han terminado todos está `listo`, no «en producción».
UPDATE "projects" pr SET "state" = 'listo'
WHERE pr."idea" = 'Trabajos creados antes de la 0.17.0, cuando «Crear» no necesitaba proyecto.'
	AND pr."state" = 'en_produccion'
	AND NOT EXISTS (
		SELECT 1 FROM "generation_jobs" j
		JOIN "scenes" s ON s."id" = j."scene_id"
		WHERE s."project_id" = pr."id" AND j."state" NOT IN ('listo', 'fallido', 'cancelado')
	);
