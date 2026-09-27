CREATE TYPE "public"."model_capability" AS ENUM('image_edit', 'image_to_video', 'text_to_video', 'text_generation', 'tts', 'speech_to_text', 'multimodal_review');--> statement-breakpoint
CREATE TYPE "public"."model_state" AS ENUM('descubierto', 'compatible', 'validado', 'retirado');--> statement-breakpoint
CREATE TABLE "model_capabilities" (
	"model_id" uuid NOT NULL,
	"capability" "model_capability" NOT NULL,
	CONSTRAINT "model_capabilities_pk" PRIMARY KEY("model_id","capability")
);
--> statement-breakpoint
CREATE TABLE "model_catalog_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"field" text NOT NULL,
	"from_value" text DEFAULT '' NOT NULL,
	"to_value" text DEFAULT '' NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"changed_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"docs_url" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_providers_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_id" uuid NOT NULL,
	"model_id" text NOT NULL,
	"name" text NOT NULL,
	"state" "model_state" DEFAULT 'descubierto' NOT NULL,
	"unit" text NOT NULL,
	"has_voice" boolean DEFAULT false NOT NULL,
	"parameters" text DEFAULT '{}' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "models_proveedor_modelo_uq" UNIQUE("provider_id","model_id")
);
--> statement-breakpoint
ALTER TABLE "model_prices" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "model_prices" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "model_capabilities" ADD CONSTRAINT "model_capabilities_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_catalog_changes" ADD CONSTRAINT "model_catalog_changes_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_catalog_changes" ADD CONSTRAINT "model_catalog_changes_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "models" ADD CONSTRAINT "models_provider_id_model_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."model_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_catalog_changes_modelo_idx" ON "model_catalog_changes" USING btree ("model_id","created_at");--> statement-breakpoint
CREATE INDEX "models_estado_idx" ON "models" USING btree ("state");