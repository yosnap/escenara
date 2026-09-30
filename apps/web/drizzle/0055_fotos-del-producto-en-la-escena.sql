-- Fotos del producto que el usuario eligió enviar con una escena.
--
-- Aditiva e idempotente: la columna nace vacía, y vacío significa «las de por defecto», así que toda escena
-- anterior envía exactamente lo mismo que antes. Volver a aplicarla no hace nada.
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "product_photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;
