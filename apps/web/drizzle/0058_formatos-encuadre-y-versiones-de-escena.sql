-- Formatos de salida del proyecto, encuadre por escena y formato, y lectura de las versiones de cada escena.
--
-- Aditiva e idempotente:
-- - el formato del montaje gana tres valores (4:5, 1:1 y 16:9); los que había no cambian;
-- - los proyectos ganan su lista de formatos, que nace en vertical 9:16 (lo que eran todos hasta ahora), y los
--   montajes su mapa de encuadres, que nace vacío (el automático, igual que antes);
-- - la idempotencia de la exportación pasa a ser por montaje, versión **y formato**. El índice nuevo se crea antes
--   de quitar el anterior, así que en ningún momento falta la red; como el anterior era más estricto, ninguna fila
--   existente puede incumplir el nuevo;
-- - un índice para leer las versiones de una escena de la más reciente a la más antigua.
-- No se borra ninguna fila. Volver a aplicarla no hace nada.
ALTER TYPE "public"."montage_format" ADD VALUE IF NOT EXISTS 'vertical_4_5';--> statement-breakpoint
ALTER TYPE "public"."montage_format" ADD VALUE IF NOT EXISTS 'cuadrado_1_1';--> statement-breakpoint
ALTER TYPE "public"."montage_format" ADD VALUE IF NOT EXISTS 'horizontal_16_9';--> statement-breakpoint
ALTER TABLE "montages" ADD COLUMN IF NOT EXISTS "framings" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "formats" jsonb DEFAULT '["vertical_9_16"]'::jsonb NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_jobs_escena_fecha_idx" ON "generation_jobs" USING btree ("scene_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "montage_exports_montaje_version_formato_uq" ON "montage_exports" USING btree ("montage_id","montage_version","format") WHERE "montage_exports"."state" <> 'fallido';--> statement-breakpoint
DROP INDEX IF EXISTS "montage_exports_montaje_version_uq";
--> statement-breakpoint
-- Selector por plataforma: las opciones de formato de la instalación se llaman por su plataforma. Solo se renombran
-- las que siguen con el nombre sembrado: si quien administra las cambió, se respeta. La de 4:5 la crea la semilla.
UPDATE "presets" SET "name" = 'Reels · TikTok · Stories (9:16)', "description" = 'Vertical a sangre, para Reels, TikTok, Shorts y Stories.'
  WHERE "owner_id" IS NULL AND "category" = 'formato' AND "slug" = 'reel-9-16' AND "name" = 'Reel 9:16';--> statement-breakpoint
UPDATE "presets" SET "name" = 'Stories con rótulos (9:16)'
  WHERE "owner_id" IS NULL AND "category" = 'formato' AND "slug" = 'story-9-16' AND "name" = 'Story 9:16';--> statement-breakpoint
UPDATE "presets" SET "name" = 'Cuadrado (1:1)', "description" = 'Cuadrado para la cuadrícula del perfil. Solo con modelos que admitan 1:1.'
  WHERE "owner_id" IS NULL AND "category" = 'formato' AND "slug" = 'cuadrado-1-1' AND "name" = 'Cuadrado 1:1';--> statement-breakpoint
UPDATE "presets" SET "name" = 'YouTube · horizontal (16:9)', "description" = 'Apaisado, para YouTube y la web. Solo con modelos que admitan 16:9.'
  WHERE "owner_id" IS NULL AND "category" = 'formato' AND "slug" = 'horizontal-16-9' AND "name" = 'Horizontal 16:9';
