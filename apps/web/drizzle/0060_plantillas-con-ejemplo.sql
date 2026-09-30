-- Ejemplo (imagen o clip de la biblioteca) que puede llevar cada plantilla y cada trend, y quién lo puso.
--
-- Aditiva e idempotente: solo añade dos columnas que admiten nulos y sus claves foráneas; no cambia ni borra ninguna
-- fila. Volver a aplicarla no hace nada. Sin ejemplo elegido (`demo_media_id` nulo) todo se comporta exactamente como
-- antes. Si el medio se borra del todo, o quien lo puso deja de existir, la plantilla se queda sin ejemplo o sin
-- responsable (`on delete set null`); un ejemplo sin responsable no se sirve.
ALTER TABLE "prompt_templates" ADD COLUMN IF NOT EXISTS "demo_media_id" uuid;--> statement-breakpoint
ALTER TABLE "prompt_templates" ADD COLUMN IF NOT EXISTS "demo_set_by" uuid;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_demo_media_id_media_id_fk" FOREIGN KEY ("demo_media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "prompt_templates" ADD CONSTRAINT "prompt_templates_demo_set_by_users_id_fk" FOREIGN KEY ("demo_set_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
