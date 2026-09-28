-- Estrategia del anuncio: el angulo, la oferta y el brief van antes del guion.
-- Aditiva de punta a punta: sin brief ni oferta, un proyecto se comporta exactamente como en 0.26.x.
-- `angulo-anuncio` es una categoria de preset nueva y NO el `angulo` de camara de la direccion del clip.
--> statement-breakpoint
ALTER TYPE "public"."preset_category" ADD VALUE 'angulo-anuncio';--> statement-breakpoint
CREATE TABLE "ad_briefs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"product_id" uuid,
	"audience" text DEFAULT '' NOT NULL,
	"better_self" text DEFAULT '' NOT NULL,
	"angle_preset_key" text DEFAULT '' NOT NULL,
	"offer_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ad_briefs_proyecto_uq" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"what_they_get" text NOT NULL,
	"price" text,
	"guarantee" text,
	"urgency" text,
	"bonus" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sensitive_claim_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"angle_preset_key" text NOT NULL,
	"accepted_text" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip" text DEFAULT '' NOT NULL,
	"accepted_by" uuid
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "variant_group_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "angle_preset_key" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_briefs" ADD CONSTRAINT "ad_briefs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_briefs" ADD CONSTRAINT "ad_briefs_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ad_briefs" ADD CONSTRAINT "ad_briefs_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_claim_declarations" ADD CONSTRAINT "sensitive_claim_declarations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_claim_declarations" ADD CONSTRAINT "sensitive_claim_declarations_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_briefs_producto_idx" ON "ad_briefs" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "ad_briefs_oferta_idx" ON "ad_briefs" USING btree ("offer_id");--> statement-breakpoint
CREATE INDEX "offers_dueno_idx" ON "offers" USING btree ("user_id","deleted_at","updated_at");--> statement-breakpoint
CREATE INDEX "offers_producto_idx" ON "offers" USING btree ("product_id","deleted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "sensitive_claim_declarations_proyecto_angulo_uq" ON "sensitive_claim_declarations" USING btree ("project_id","angle_preset_key");--> statement-breakpoint
CREATE INDEX "sensitive_claim_declarations_proyecto_idx" ON "sensitive_claim_declarations" USING btree ("project_id","accepted_at");--> statement-breakpoint
CREATE INDEX "projects_grupo_variantes_idx" ON "projects" USING btree ("variant_group_id");--> statement-breakpoint
CREATE INDEX "projects_angulo_idx" ON "projects" USING btree ("user_id","angle_preset_key");