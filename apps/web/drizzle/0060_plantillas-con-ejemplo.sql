-- Ejemplo (imagen o clip de la biblioteca) que puede llevar cada plantilla y cada trend.
--
-- Aditiva e idempotente: solo añade una columna que admite nulos y su clave foránea; no cambia ni borra ninguna fila.
-- Volver a aplicarla no hace nada. Sin ejemplo elegido (`demo_media_id` nulo) todo se comporta exactamente como antes.
-- Si el medio se borra del todo, la plantilla se queda sin ejemplo (`on delete set null`).
ALTER TABLE "prompt_templates" ADD COLUMN IF NOT EXISTS "demo_media_id" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_demo_media_id_media_id_fk" FOREIGN KEY ("demo_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
