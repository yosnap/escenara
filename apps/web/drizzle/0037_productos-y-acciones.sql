CREATE TYPE "public"."product_reference_kind" AS ENUM('etiqueta', 'envase', 'mecanismo', 'captura_pantalla', 'suelto');--> statement-breakpoint
CREATE TYPE "public"."product_kind" AS ENUM('fisico', 'digital');--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'accion-producto';--> statement-breakpoint
CREATE TABLE "product_references" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"media_id" uuid NOT NULL,
	"kind" "product_reference_kind" NOT NULL,
	"sort_order" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_references_producto_medio_uq" UNIQUE("product_id","media_id")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"kind" "product_kind" DEFAULT 'fisico' NOT NULL,
	"brand_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_dueno_nombre_uq" UNIQUE("owner_id","name")
);
--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD COLUMN "product_action" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "product_id" uuid;--> statement-breakpoint
ALTER TABLE "scenes" ADD COLUMN "product_action" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_references" ADD CONSTRAINT "product_references_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_references" ADD CONSTRAINT "product_references_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_references_producto_idx" ON "product_references" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "product_references_medio_idx" ON "product_references" USING btree ("media_id");--> statement-breakpoint
CREATE INDEX "products_dueno_idx" ON "products" USING btree ("owner_id","updated_at");--> statement-breakpoint
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_jobs_producto_idx" ON "generation_jobs" USING btree ("product_id");