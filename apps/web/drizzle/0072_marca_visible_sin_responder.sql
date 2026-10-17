ALTER TABLE "products" ALTER COLUMN "brand_visible" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "brand_visible" DROP NOT NULL;--> statement-breakpoint
-- Hasta ahora «no» era el valor por defecto de una casilla sin marcar, así que no prueba que se respondiera: esos
-- productos quedan sin responder. Un «sí» sí se marcó a propósito y se conserva.
UPDATE "products" SET "brand_visible" = NULL WHERE "brand_visible" = false;
