CREATE TYPE "public"."coherence_check" AS ENUM('identidad', 'guion', 'resultado', 'emocion');--> statement-breakpoint
CREATE TYPE "public"."coherence_correction" AS ENUM('acierta', 'se_equivoca');--> statement-breakpoint
CREATE TYPE "public"."coherence_mode" AS ENUM('sombra', 'activa');--> statement-breakpoint
CREATE TYPE "public"."coherence_subject" AS ENUM('referencia', 'escena', 'trabajo');--> statement-breakpoint
CREATE TYPE "public"."coherence_verdict" AS ENUM('pasa', 'revisar', 'no_pasa');--> statement-breakpoint
CREATE TYPE "public"."reference_identity_verdict" AS ENUM('sin_comprobar', 'pasa', 'revisar', 'no_pasa');--> statement-breakpoint
ALTER TYPE "public"."assistant_run_kind" ADD VALUE 'percepcion';--> statement-breakpoint
CREATE TABLE "coherence_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"check" "coherence_check" NOT NULL,
	"mode" "coherence_mode" NOT NULL,
	"subject" "coherence_subject" NOT NULL,
	"subject_id" uuid NOT NULL,
	"character_id" uuid,
	"project_id" uuid,
	"verdict" "coherence_verdict" NOT NULL,
	"confidence" real NOT NULL,
	"threshold" real NOT NULL,
	"fit" real NOT NULL,
	"probabilities" jsonb NOT NULL,
	"facts" text DEFAULT '' NOT NULL,
	"evidence" text NOT NULL,
	"decision_model" text NOT NULL,
	"perception_provider" text DEFAULT '' NOT NULL,
	"perception_model" text DEFAULT '' NOT NULL,
	"rules_version" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"decision_eur" real DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"correction" "coherence_correction",
	"corrected_at" timestamp with time zone,
	"corrected_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_references" ADD COLUMN "identity_verdict" "reference_identity_verdict" DEFAULT 'sin_comprobar' NOT NULL;--> statement-breakpoint
ALTER TABLE "character_references" ADD COLUMN "identity_reason" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "coherence_declared" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "coherence_decisions" ADD CONSTRAINT "coherence_decisions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coherence_decisions" ADD CONSTRAINT "coherence_decisions_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coherence_decisions_sujeto_idx" ON "coherence_decisions" USING btree ("subject_id","created_at");--> statement-breakpoint
CREATE INDEX "coherence_decisions_comprobacion_idx" ON "coherence_decisions" USING btree ("check","created_at");--> statement-breakpoint
CREATE INDEX "coherence_decisions_usuario_idx" ON "coherence_decisions" USING btree ("user_id","created_at");