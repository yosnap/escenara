CREATE TYPE "public"."control_state" AS ENUM('listo', 'ajustes', 'revision', 'bloqueado');--> statement-breakpoint
CREATE TYPE "public"."control_subject" AS ENUM('escena', 'trabajo');--> statement-breakpoint
CREATE TABLE "control_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject" "control_subject" NOT NULL,
	"subject_id" uuid,
	"job_kind" text NOT NULL,
	"state" "control_state" NOT NULL,
	"rules_version" text NOT NULL,
	"rules" jsonb NOT NULL,
	"confirmed" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "control_evaluations" ADD CONSTRAINT "control_evaluations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "control_evaluations_usuario_idx" ON "control_evaluations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "control_evaluations_sujeto_idx" ON "control_evaluations" USING btree ("subject_id","created_at");