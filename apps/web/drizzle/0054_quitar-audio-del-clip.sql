-- Quitar el audio propio del clip de una escena en el montaje y la exportación.
--
-- Es una opción por escena e independiente del modo de voz del proyecto. Aditiva e idempotente: la columna nace en
-- `false`, así que toda escena anterior suena exactamente igual que antes, y volver a aplicarla no hace nada.
ALTER TABLE "scenes" ADD COLUMN IF NOT EXISTS "clip_audio_muted" boolean DEFAULT false NOT NULL;
