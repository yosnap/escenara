ALTER TABLE "media" ADD COLUMN "character_sheet_of" uuid;--> statement-breakpoint
CREATE INDEX "media_hoja_personaje_idx" ON "media" USING btree ("character_sheet_of");--> statement-breakpoint
-- Relleno de la versión 1 de los personajes que ya existían: desde 0.15.0 todo personaje tiene versión (los
-- trabajos la citan y la ficha se compone de ella), y crearla desde una lectura convertiría un GET en una
-- escritura. Se hace aquí, una vez, con lo que cada personaje tiene ahora mismo.
--
-- `changed_fields` va vacío porque una primera versión no cambia nada respecto a nada, y `created_at` es la
-- fecha de creación del personaje: esta versión describe cómo era desde el principio, no de hoy.
INSERT INTO "character_versions" (
  "character_id", "number", "sheet", "reference_media_ids", "change_reason", "changed_fields", "created_by", "created_at"
)
SELECT
  c."id",
  1,
  jsonb_build_object(
    'rasgos', c."traits",
    'estilo', c."style",
    'vestuario', c."wardrobe",
    'personalidad', c."personality",
    'voz', c."voice",
    'descripcion', c."description"
  ),
  COALESCE(
    (
      SELECT jsonb_agg(cr."media_id" ORDER BY cr."sort_order" ASC, cr."created_at" ASC)
      FROM "character_references" cr
      JOIN "media" m ON m."id" = cr."media_id"
      WHERE cr."character_id" = c."id" AND m."deleted_at" IS NULL
    ),
    '[]'::jsonb
  ),
  '',
  '[]'::jsonb,
  c."owner_id",
  c."created_at"
FROM "characters" c
WHERE NOT EXISTS (SELECT 1 FROM "character_versions" v WHERE v."character_id" = c."id");
