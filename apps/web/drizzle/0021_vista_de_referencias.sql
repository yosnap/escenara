ALTER TABLE "character_versions" ADD COLUMN "reference_view_keys" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Las versiones que ya existían no guardaban la vista de cada foto, porque la columna no existía. Se rellenan
-- con la vista que esas mismas fotos tienen **ahora** en el personaje: es el único dato que hay, y es el que
-- deja la versión vigente diciendo la verdad, que es lo que se compara para decidir si hay que versionar. Sin
-- este relleno, el primer guardado de cualquier personaje antiguo crearía una versión sin que cambiara nada.
UPDATE "character_versions" v
  SET "reference_view_keys" = coalesce((
    SELECT jsonb_agg(coalesce(r."view_key", '') ORDER BY e."ord")
    FROM jsonb_array_elements_text(v."reference_media_ids") WITH ORDINALITY AS e("media_id", "ord")
    LEFT JOIN "character_references" r
      ON r."character_id" = v."character_id" AND r."media_id" = e."media_id"::uuid
  ), '[]'::jsonb);
