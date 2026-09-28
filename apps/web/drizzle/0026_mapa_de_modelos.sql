CREATE TYPE "public"."model_map_kind" AS ENUM('texto', 'voz', 'transcripcion', 'imagen', 'video');--> statement-breakpoint
ALTER TYPE "public"."credential_provider" ADD VALUE 'local';--> statement-breakpoint
CREATE TABLE "model_map_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"kind" "model_map_kind" NOT NULL,
	"position" integer NOT NULL,
	"provider" "credential_provider" NOT NULL,
	"compatible_id" uuid,
	"model" text DEFAULT '' NOT NULL,
	CONSTRAINT "model_map_usuario_tipo_posicion_uq" UNIQUE NULLS NOT DISTINCT("user_id","kind","position")
);
--> statement-breakpoint
ALTER TABLE "model_map_entries" ADD CONSTRAINT "model_map_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_map_entries" ADD CONSTRAINT "model_map_entries_compatible_id_openai_providers_id_fk" FOREIGN KEY ("compatible_id") REFERENCES "public"."openai_providers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_map_usuario_tipo_idx" ON "model_map_entries" USING btree ("user_id","kind","position");--> statement-breakpoint
-- El cambio de crédito a euros pasa a ser **por proveedor**: los créditos de KIE y los de ElevenLabs no valen lo
-- mismo y nunca debieron compartir una sola cifra. El valor que hubiera configurado la instalación era el de KIE,
-- que es con quien se generaba, así que se conserva ahí y no se pierde.
UPDATE "settings" SET "key" = 'eurosPorCreditoKie' WHERE "key" = 'eurosPorCredito';
