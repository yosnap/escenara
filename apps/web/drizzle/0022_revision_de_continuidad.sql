CREATE TYPE "public"."review_state" AS ENUM('reservado', 'cerrado');--> statement-breakpoint
CREATE TYPE "public"."review_severity" AS ENUM('informativa', 'aviso', 'critica');--> statement-breakpoint
CREATE TYPE "public"."review_kind" AS ENUM('automatica', 'humana', 'multimodal');--> statement-breakpoint
CREATE TYPE "public"."review_verdict" AS ENUM('acepta', 'rechaza', 'pendiente');--> statement-breakpoint
CREATE TABLE "review_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"job_id" uuid,
	"clip_media_id" uuid,
	"kind" "review_kind" NOT NULL,
	"severity" "review_severity" NOT NULL,
	"verdict" "review_verdict" NOT NULL,
	"checks" jsonb NOT NULL,
	"reviewer_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"credits" real,
	"rules_version" text NOT NULL,
	"invalidated_at" timestamp with time zone,
	"invalidation_reason" text DEFAULT '' NOT NULL,
	"state" "review_state" DEFAULT 'cerrado' NOT NULL,
	"idempotency_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD COLUMN "review_id" uuid;--> statement-breakpoint
ALTER TABLE "review_results" ADD CONSTRAINT "review_results_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_results" ADD CONSTRAINT "review_results_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "review_results_escena_idx" ON "review_results" USING btree ("scene_id","created_at");--> statement-breakpoint
CREATE INDEX "review_results_vigencia_idx" ON "review_results" USING btree ("scene_id","invalidated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "review_results_revisor_idempotencia_uq" ON "review_results" USING btree ("reviewer_id","idempotency_key") WHERE "review_results"."idempotency_key" is not null and "review_results"."reviewer_id" is not null;--> statement-breakpoint
CREATE INDEX "review_results_reservadas_idx" ON "review_results" USING btree ("state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_ledger_revision_apunte_uq" ON "usage_ledger" USING btree ("review_id","entry_type") WHERE "usage_ledger"."entry_type" <> 'ajuste';--> statement-breakpoint
CREATE INDEX "usage_ledger_revision_idx" ON "usage_ledger" USING btree ("review_id");