CREATE TYPE "public"."credential_status" AS ENUM('valida', 'invalida');--> statement-breakpoint
CREATE TYPE "public"."credential_provider" AS ENUM('kie', 'google');--> statement-breakpoint
CREATE TABLE "installation_secrets" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"hint" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid
);
--> statement-breakpoint
CREATE TABLE "provider_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "credential_provider" NOT NULL,
	"secret" text NOT NULL,
	"hint" text NOT NULL,
	"status" "credential_status" DEFAULT 'valida' NOT NULL,
	"last_test_code" text,
	"last_test_detail" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tested_at" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	CONSTRAINT "provider_credentials_usuario_proveedor_uq" UNIQUE("user_id","provider")
);
--> statement-breakpoint
ALTER TABLE "installation_secrets" ADD CONSTRAINT "installation_secrets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_credentials" ADD CONSTRAINT "provider_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;