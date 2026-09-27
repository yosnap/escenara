-- El índice ya lo crea 0010_personajes_y_consentimiento.sql. Esta migración existe solo porque ahora está
-- **declarado en el esquema** (`esquema-personajes.ts`), que es la única fuente de verdad: sin ella,
-- `db:generate` propondría borrarlo en la siguiente migración. Es idempotente a propósito: en una instalación
-- que ya aplicó 0010 no hace nada, y en una nueva tampoco, porque 0010 va antes.
CREATE UNIQUE INDEX IF NOT EXISTS "consent_records_personaje_vigente_uq" ON "consent_records" USING btree ("character_id") WHERE "consent_records"."revoked_at" is null;
