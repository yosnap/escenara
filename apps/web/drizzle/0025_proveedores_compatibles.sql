ALTER TYPE "public"."credential_provider" ADD VALUE 'compatible';--> statement-breakpoint
CREATE TABLE "openai_providers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"secret" text NOT NULL,
	"hint" text NOT NULL,
	"models" text[] DEFAULT '{}' NOT NULL,
	"status" "credential_status" DEFAULT 'valida' NOT NULL,
	"last_test_code" text,
	"last_test_detail" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"tested_at" timestamp with time zone,
	"rotated_at" timestamp with time zone,
	CONSTRAINT "openai_providers_usuario_nombre_uq" UNIQUE("user_id","name")
);
--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "provider_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "assistant_runs" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "usage_ledger" ADD COLUMN "provider_name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "openai_providers" ADD CONSTRAINT "openai_providers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;