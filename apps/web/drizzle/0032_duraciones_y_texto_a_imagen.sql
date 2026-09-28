-- Duraciones de los dos motores de escena hablada de Gemini Omni (0.23.4). El proveedor publica el precio de
-- cada una (63, 84, 105 y 126 créditos a 4, 6, 8 y 10 s en 720p, leído el 2026-09-28) y los 63 de 4 s son los
-- que se pagaron de verdad, así que las cuatro se pueden cobrar sin inventar ninguna tarifa. Lo que se ofrece
-- de verdad sigue siendo solo lo que tenga su precio registrado: la sincronización de precios las da de alta.
UPDATE "models"
SET "parameters" = '{"duraciones":[4,6,8,10],"proporciones":["9:16"],"resoluciones":["720p"],"formatosReferencia":["image/jpeg","image/png","image/webp"],"maximoReferencias":7}'
WHERE "model_id" IN ('google/gemini-omni-flash-1-1', 'gemini-omni-video')
  AND "parameters" LIKE '%"duraciones":[4]%';
--> statement-breakpoint
-- Textos de duración de los presets de la instalación (0.23.4). Decían cosas que ya no son ciertas («es la
-- duración de fábrica», «esta versión no produce clips de 6 s») y contradecían lo que después ofrecía el
-- modelo. Lo que se puede pedir y lo que cuesta lo dice ahora el modelo elegido, no esta frase. Las copias de
-- cada usuario no se tocan: son suyas.
UPDATE "presets" SET "description" = 'Plano corto: un gesto o una frase suelta. Lo que cuesta y si se puede pedir lo dice el modelo que elijas.'
WHERE "owner_id" IS NULL AND "slug" = 'clip-4';--> statement-breakpoint
UPDATE "presets" SET "description" = 'Da tiempo a una frase entera. Solo se puede elegir con los modelos que sepan cobrar esta duración.'
WHERE "owner_id" IS NULL AND "slug" = 'clip-6';--> statement-breakpoint
UPDATE "presets" SET "description" = 'Para una acción con principio y fin. Solo se puede elegir con los modelos que sepan cobrar esta duración.'
WHERE "owner_id" IS NULL AND "slug" = 'clip-8';
--> statement-breakpoint
-- Los modelos de nano banana que ya están en el catálogo **también generan sin imagen de partida**: su campo de
-- referencias es opcional (docs.kie.ai, comprobado el 2026-09-28), así que se les añade la capacidad en lugar de
-- obligar a dar de alta otro modelo. Es lo que permite que el retrato de un personaje inventado se pida al mismo
-- motor que ya se usa y al mismo precio medido.
INSERT INTO "model_capabilities" ("model_id", "capability")
SELECT "models"."id", 'text_to_image'::"public"."model_capability"
FROM "models"
WHERE "models"."model_id" IN ('nano-banana-2-lite', 'nano-banana-2', 'nano-banana-pro')
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Tarifas de referencia que se guardaron cuando un modelo no tenía familia («trabajo a 1080p»): ahora esos
-- modelos tienen la suya y sus precios llegan por duración, así que la de referencia sobra y confundiría al
-- elegir. Solo se borran las **publicadas**: una medida con dinero real no la toca ninguna migración.
DELETE FROM "model_prices"
WHERE "published" = true
  AND "unit" LIKE 'trabajo a %'
  AND "model" IN ('google/gemini-omni-flash-1-1', 'gemini-omni-video');
