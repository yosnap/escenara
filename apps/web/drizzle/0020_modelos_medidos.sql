ALTER TABLE "scenes" ALTER COLUMN "planned_seconds" SET DEFAULT 8;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "clip_seconds" integer DEFAULT 8 NOT NULL;--> statement-breakpoint
-- Los proyectos que ya existían se han producido siempre con clips de 4 s, la única duración que estaba medida
-- hasta ahora: se quedan con la suya, y los nuevos nacen con los 8 s de fábrica.
UPDATE "projects" SET "clip_seconds" = 4;--> statement-breakpoint
-- Cada escena dura lo que su proyecto: lo que se muestra y lo que se le pide al modelo tienen que ser lo mismo.
UPDATE "scenes" SET "planned_seconds" = p."clip_seconds"
  FROM "projects" p
  WHERE "scenes"."project_id" = p."id" AND "scenes"."planned_seconds" <> p."clip_seconds";--> statement-breakpoint
-- Las descripciones de los presets de duración de la semilla decían que solo 4 s tenía precio medido. Se
-- actualizan solo si siguen con el texto de fábrica: la semilla no pisa lo que haya cambiado quien administra.
UPDATE "presets" SET "description" = 'Plano corto. Se usa en los proyectos con clips de 4 s; cuesta lo mismo que uno de 8 s (medido el 2026-09-27).', "updated_at" = now()
  WHERE "owner_id" IS NULL AND "slug" = 'clip-4' AND "description" = 'Plano corto. Es la duración con precio medido en el catálogo, así que es la que se puede elegir hoy.';--> statement-breakpoint
UPDATE "presets" SET "description" = 'Da tiempo a una frase entera. Esta versión no produce clips de 6 s: su coste no está medido.', "updated_at" = now()
  WHERE "owner_id" IS NULL AND "slug" = 'clip-6' AND "description" = 'Da tiempo a una frase entera. Solo se puede elegir si el modelo la admite Y su precio está medido por clip de 6 s en Admin › Modelos: el precio se cobra por unidad.';--> statement-breakpoint
UPDATE "presets" SET "description" = 'Para una acción con principio y fin. Es la duración de fábrica de los proyectos y la que se usa en los de 8 s.', "updated_at" = now()
  WHERE "owner_id" IS NULL AND "slug" = 'clip-8' AND "description" = 'Para una acción con principio y fin. Solo se puede elegir si el modelo la admite Y su precio está medido por clip de 8 s en Admin › Modelos: el precio se cobra por unidad.';--> statement-breakpoint
-- Solo se corrige lo que sigue exactamente como lo dejó la semilla: si quien administra ya tocó el modelo o su
-- precio, su decisión manda y la migración no la pisa.
-- Veo 3.1 Fast pasa a ser el modelo de animación predeterminado y Veo 3.1 Lite deja de serlo. El alta de Fast la
-- hace la semilla versionada del catálogo; aquí solo se corrige lo que la semilla no pisa nunca. Y la unidad del
-- precio deja de mentir: los mismos 60 créditos cubren el clip de 4 s y el de 8 s, medidos los dos.
UPDATE "models"
  SET "is_default" = false,
      "unit" = 'vídeo de 4 u 8 s',
      "parameters" = '{"duraciones":[8,4],"proporciones":["9:16"],"resoluciones":["720p","1080p"],"formatosReferencia":["image/jpeg","image/png","image/webp"],"maximoReferencias":2}',
      "version" = "version" + 1,
      "updated_at" = now()
  WHERE "model_id" = 'veo3_lite'
    AND "provider_id" IN (SELECT "id" FROM "model_providers" WHERE "slug" = 'kie')
    AND "unit" = 'vídeo de 4 s'
    AND NOT EXISTS (SELECT 1 FROM "model_catalog_changes" c WHERE c."model_id" = "models"."id" AND c."changed_by" IS NOT NULL);--> statement-breakpoint
UPDATE "model_prices"
  SET "unit" = 'vídeo de 4 u 8 s',
      "source" = 'Medido con la cuenta de KIE del propietario: 60 créditos a 4 s en el prototipo 0.3.0 y los mismos 60 a 8 s el 2026-09-27',
      "checked_at" = '2026-09-27T00:00:00Z',
      "version" = "version" + 1,
      "updated_at" = now()
  WHERE "provider" = 'kie' AND "model" = 'veo3_lite' AND "unit" = 'vídeo de 4 s';--> statement-breakpoint
-- El modelo de texto del asistente ya se ha ejecutado de verdad: queda validado y con su coste medido.
UPDATE "models"
  SET "state" = 'validado',
      "evidence" = 'Ejecutado de verdad el 2026-09-27 con el adaptador de la app: traducir una frase costó 0,05 créditos en 3 s, un lote de dos o tres textos de la ficha entre 0,28 y 0,34, y el guion de cuatro escenas del asistente entre 0,5 y 0,93 créditos en 8 a 37 s.',
      "version" = "version" + 1,
      "updated_at" = now()
  WHERE "model_id" = 'gpt-5-6-sol'
    AND "provider_id" IN (SELECT "id" FROM "model_providers" WHERE "slug" = 'kie')
    AND "state" = 'descubierto'
    AND NOT EXISTS (SELECT 1 FROM "model_catalog_changes" c WHERE c."model_id" = "models"."id" AND c."changed_by" IS NOT NULL);--> statement-breakpoint
UPDATE "model_prices"
  SET "credits" = 1.5,
      "source" = 'Medido el 2026-09-27 con la clave de KIE del propietario: de 0,05 a 0,93 créditos por llamada según el largo. Se registran 1,5 con margen prudente porque el coste depende de los tokens.',
      "checked_at" = '2026-09-27T00:00:00Z',
      "version" = "version" + 1,
      "updated_at" = now()
  WHERE "provider" = 'kie' AND "model" = 'gpt-5-6-sol' AND "credits" = 3;--> statement-breakpoint
-- Cada cambio queda en el historial del catálogo sin autor, como el de la semilla: lo hizo la migración. Solo se
-- apunta lo que esta migración ha cambiado de verdad (dentro de su transacción, `now()` es el mismo instante).
INSERT INTO "model_catalog_changes" ("model_id", "field", "from_value", "to_value", "evidence")
  SELECT "id", 'predeterminado', 'sí', 'no',
    'Veo 3.1 Fast pasa a ser el predeterminado: mismo precio medido (60 créditos) por un clip del doble de largo.'
  FROM "models" WHERE "model_id" = 'veo3_lite' AND "updated_at" = now();--> statement-breakpoint
INSERT INTO "model_catalog_changes" ("model_id", "field", "from_value", "to_value", "evidence")
  SELECT "id", 'precio', '60 créditos por vídeo de 4 s', '60 créditos por vídeo de 4 u 8 s',
    'Medido el 2026-09-27: un clip de 8 s cuesta los mismos 60 créditos que uno de 4 s.'
  FROM "models" WHERE "model_id" = 'veo3_lite' AND EXISTS (SELECT 1 FROM "model_prices" mp WHERE mp."provider" = 'kie' AND mp."model" = 'veo3_lite' AND mp."updated_at" = now());--> statement-breakpoint
INSERT INTO "model_catalog_changes" ("model_id", "field", "from_value", "to_value", "evidence")
  SELECT "id", 'estado', 'descubierto', 'validado',
    'Ejecutado el 2026-09-27 con la clave real: guion y traducción leídos bien, de 0,05 a 0,93 créditos por llamada.'
  FROM "models" WHERE "model_id" = 'gpt-5-6-sol' AND "updated_at" = now();--> statement-breakpoint
INSERT INTO "model_catalog_changes" ("model_id", "field", "from_value", "to_value", "evidence")
  SELECT "id", 'precio', '3 créditos por respuesta de texto', '1,5 créditos por respuesta de texto',
    'Medido el 2026-09-27: de 0,05 a 0,93 créditos por llamada, con margen prudente porque depende de los tokens.'
  FROM "models" WHERE "model_id" = 'gpt-5-6-sol' AND EXISTS (SELECT 1 FROM "model_prices" mp WHERE mp."provider" = 'kie' AND mp."model" = 'gpt-5-6-sol' AND mp."updated_at" = now());
