ALTER TYPE "public"."model_state" ADD VALUE 'precio_publicado' BEFORE 'compatible';--> statement-breakpoint
CREATE TABLE "model_price_syncs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"ok" boolean DEFAULT true NOT NULL,
	"published" integer DEFAULT 0 NOT NULL,
	"understood" integer DEFAULT 0 NOT NULL,
	"models_created" integer DEFAULT 0 NOT NULL,
	"prices_created" integer DEFAULT 0 NOT NULL,
	"prices_updated" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"started_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_prices" ADD COLUMN "published" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "model_price_syncs" ADD CONSTRAINT "model_price_syncs_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_price_syncs_proveedor_idx" ON "model_price_syncs" USING btree ("provider","created_at");