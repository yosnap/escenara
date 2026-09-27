CREATE TYPE "public"."consent_scope" AS ENUM('personal', 'comercial');--> statement-breakpoint
CREATE TYPE "public"."character_state" AS ENUM('borrador', 'en_revision', 'listo', 'bloqueado');--> statement-breakpoint
CREATE TYPE "public"."reference_origin" AS ENUM('foto_original', 'vista_generada');--> statement-breakpoint
CREATE TYPE "public"."character_kind" AS ENUM('persona', 'animal');--> statement-breakpoint
CREATE TYPE "public"."consent_holder" AS ENUM('yo', 'tercero', 'animal_propio');--> statement-breakpoint
CREATE TABLE "character_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"origin" "reference_origin" DEFAULT 'foto_original' NOT NULL,
	"declared_view" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_references_personaje_medio_uq" UNIQUE("character_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" character_kind NOT NULL,
	"species_notes" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"state" character_state DEFAULT 'borrador' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_propietario_nombre_uq" UNIQUE("owner_id","name")
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"holder_type" "consent_holder" NOT NULL,
	"adult_declared" boolean DEFAULT false NOT NULL,
	"usage_scope" "consent_scope" DEFAULT 'personal' NOT NULL,
	"document_media_id" uuid,
	"registered_by" uuid,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_approved" boolean,
	"review_note" text DEFAULT '' NOT NULL,
	"revoked_at" timestamp with time zone,
	"revocation_reason" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "character_id" uuid;--> statement-breakpoint
ALTER TABLE "character_references" ADD CONSTRAINT "character_references_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_references" ADD CONSTRAINT "character_references_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_document_media_id_media_id_fk" FOREIGN KEY ("document_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "character_references_personaje_idx" ON "character_references" USING btree ("character_id","sort_order");--> statement-breakpoint
CREATE INDEX "character_references_medio_idx" ON "character_references" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "characters_propietario_idx" ON "characters" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "characters_estado_idx" ON "characters" USING btree ("state");--> statement-breakpoint
CREATE INDEX "consent_records_personaje_idx" ON "consent_records" USING btree ("character_id","registered_at");--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_jobs_personaje_idx" ON "generation_jobs" USING btree ("character_id");--> statement-breakpoint
-- Un personaje tiene como mucho un consentimiento **sin revocar**: los revocados se conservan porque son la
-- prueba de lo que se declaró, pero dos vigentes a la vez harían ambigua la respuesta de «puede generar».
CREATE UNIQUE INDEX "consent_records_personaje_vigente_uq" ON "consent_records" USING btree ("character_id") WHERE "revoked_at" IS NULL;
