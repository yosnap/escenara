CREATE TYPE "public"."preset_category" AS ENUM('especialidad', 'formato', 'estilo', 'vestuario', 'duracion', 'accion');--> statement-breakpoint
CREATE TABLE "presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"category" "preset_category" NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"values" text DEFAULT '{}' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"duplicated_from" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "presets_dueno_categoria_clave_uq" UNIQUE("owner_id","category","slug")
);
--> statement-breakpoint
CREATE TABLE "prompt_template_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"number" integer NOT NULL,
	"template" text NOT NULL,
	"variables" text DEFAULT '[]' NOT NULL,
	"model_restrictions" text DEFAULT '{}' NOT NULL,
	"change_reason" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_template_versions_plantilla_numero_uq" UNIQUE("template_id","number")
);
--> statement-breakpoint
CREATE TABLE "prompt_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"capability" "model_capability" NOT NULL,
	"template" text DEFAULT '' NOT NULL,
	"variables" text DEFAULT '[]' NOT NULL,
	"model_restrictions" text DEFAULT '{}' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"duplicated_from" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "prompt_templates_dueno_clave_uq" UNIQUE("owner_id","slug")
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "prompt_template_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "prompt_template_version_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "prompt_edited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "presets" ADD CONSTRAINT "presets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presets" ADD CONSTRAINT "presets_duplicated_from_presets_id_fk" FOREIGN KEY ("duplicated_from") REFERENCES "public"."presets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_template_versions" ADD CONSTRAINT "prompt_template_versions_template_id_prompt_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_template_versions" ADD CONSTRAINT "prompt_template_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_duplicated_from_prompt_templates_id_fk" FOREIGN KEY ("duplicated_from") REFERENCES "public"."prompt_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "presets_instalacion_categoria_clave_uq" ON "presets" USING btree ("category","slug") WHERE "presets"."owner_id" is null;--> statement-breakpoint
CREATE INDEX "presets_listado_idx" ON "presets" USING btree ("category","sort_order");--> statement-breakpoint
CREATE INDEX "presets_dueno_idx" ON "presets" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "prompt_template_versions_plantilla_idx" ON "prompt_template_versions" USING btree ("template_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "prompt_templates_instalacion_clave_uq" ON "prompt_templates" USING btree ("slug") WHERE "prompt_templates"."owner_id" is null;--> statement-breakpoint
CREATE INDEX "prompt_templates_capacidad_idx" ON "prompt_templates" USING btree ("capability","sort_order");--> statement-breakpoint
CREATE INDEX "prompt_templates_dueno_idx" ON "prompt_templates" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_prompt_template_id_prompt_templates_id_fk" FOREIGN KEY ("prompt_template_id") REFERENCES "public"."prompt_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_prompt_template_version_id_prompt_template_versions_id_fk" FOREIGN KEY ("prompt_template_version_id") REFERENCES "public"."prompt_template_versions"("id") ON DELETE set null ON UPDATE no action;