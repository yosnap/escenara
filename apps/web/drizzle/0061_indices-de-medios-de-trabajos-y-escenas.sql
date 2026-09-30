-- Índices sobre las columnas de medios de los trabajos, las escenas y las exportaciones.
--
-- Los ejemplos de plantilla comprueban en cada lectura de qué trabajo, escena o exportación sale un medio; sin estos
-- índices cada petición recorría esas tablas enteras. Aditiva e idempotente (`IF NOT EXISTS`): no cambia ni borra
-- ninguna fila y volver a aplicarla no hace nada. Son índices normales, no concurrentes: el migrador aplica cada
-- migración dentro de una transacción y `CREATE INDEX CONCURRENTLY` no puede ir en una. Las tablas son pequeñas y los
-- construye en un instante; aun así, conviene migrar con el worker parado, como siempre.
CREATE INDEX IF NOT EXISTS "generation_jobs_resultado_idx" ON "generation_jobs" USING btree ("result_media_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generation_jobs_origen_idx" ON "generation_jobs" USING btree ("source_media_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "montage_exports_resultado_idx" ON "montage_exports" USING btree ("result_media_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenes_fotograma_aprobado_idx" ON "scenes" USING btree ("approved_frame_media_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenes_clip_idx" ON "scenes" USING btree ("clip_media_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenes_referencia_idx" ON "scenes" USING btree ("reference_image_media_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scenes_referencia_cambio_idx" ON "scenes" USING btree ("change_only_reference_media_id");
