-- Causa concreta por la que el proveedor no completó una tarea que aceptó (filtro de seguridad, imagen rechazada…).
--
-- Aditiva e idempotente: la columna nace vacía y guarda solo una clave propia de lista cerrada, nunca el texto del
-- proveedor. Los trabajos anteriores se quedan en `null` y se muestran exactamente igual que antes. Volver a
-- aplicarla no hace nada.
ALTER TABLE "generation_jobs" ADD COLUMN IF NOT EXISTS "failure_cause" text;
