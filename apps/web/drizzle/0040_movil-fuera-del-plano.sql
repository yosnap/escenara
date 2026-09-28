-- El proveedor leía «shot on a phone» al pie de la letra y metía el móvil en el plano (medido con dinero real el 2026-09-28).
-- Se corrigen los presets de la instalación que conservan el texto de fábrica; los editados por quien administra no se tocan.
--> statement-breakpoint
UPDATE "presets" SET "values" = replace("values", 'A phone-shot social video of a person talking straight to camera', 'A social video with the look of footage filmed on a smartphone, of a person talking straight to camera; the phone that films is never visible in the frame'), "updated_at" = now()
WHERE "owner_id" IS NULL AND "values" LIKE '%A phone-shot social video of a person talking straight to camera%';
--> statement-breakpoint
UPDATE "presets" SET "values" = replace("values", 'shot on a modern phone with a clean, deliberate composition and a shallow depth of field', 'with the look of a modern smartphone camera, a clean, deliberate composition and a shallow depth of field; the phone that takes it is never visible in the frame'), "updated_at" = now()
WHERE "owner_id" IS NULL AND "values" LIKE '%shot on a modern phone with a clean, deliberate composition and a shallow depth of field%';
--> statement-breakpoint
UPDATE "presets" SET "values" = replace("values", 'shot handheld on a phone, slightly off-centre, with the small imperfections of an unplanned take', 'with the look of a handheld smartphone shot, slightly off-centre, with the small imperfections of an unplanned take; the phone that takes it is never visible in the frame'), "updated_at" = now()
WHERE "owner_id" IS NULL AND "values" LIKE '%shot handheld on a phone, slightly off-centre, with the small imperfections of an unplanned take%';
