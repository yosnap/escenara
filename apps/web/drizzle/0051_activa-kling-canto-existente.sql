-- Kling Standard podía estar descubierto desde antes de la 0.29. La sincronización diaria respeta las
-- decisiones del admin y no cambia modelos existentes. Solo completamos la ficha automática intacta.
DO $$
DECLARE
  id_kling uuid;
BEGIN
  SELECT m.id INTO id_kling
  FROM models m
  JOIN model_providers p ON p.id = m.provider_id
  WHERE p.slug = 'kie'
    AND m.model_id = 'kling/v1-avatar-standard'
    AND m.state = 'descubierto'
    AND m.unit = 'segundo a 720p standard'
    AND m.notes = 'Esta instalación todavía no sabe con qué parámetros pedirle nada a este modelo, así que no se puede elegir.'
    AND m.evidence = ''
    AND m.version = 1
    AND NOT EXISTS (
      SELECT 1 FROM model_catalog_changes c
      WHERE c.model_id = m.id AND c.field <> 'alta'
    )
  FOR UPDATE OF m;

  IF id_kling IS NOT NULL THEN
    UPDATE models SET
      name = 'Kling AI Avatar Standard',
      state = 'precio_publicado',
      unit = 'clip cantado de 1 s a 720p',
      has_voice = true,
      parameters = '{"duraciones":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15],"proporciones":[],"resoluciones":["720p"],"formatosReferencia":["image/jpeg","image/png"],"maximoReferencias":1}',
      notes = 'Campos leídos en docs.kie.ai y tarifas en la tabla pública de precios de KIE, el 2026-09-29 (kie.ai/kling-ai-avatar?model=kling/v1-avatar-standard). Recibe «image_url», «audio_url» y «prompt»; tampoco acepta «aspect_ratio». Publica 8 créditos por segundo a 720p, en tramos de hasta 15 segundos. Precio publicado, no medido en esta instalación.',
      version = version + 1,
      updated_at = now()
    WHERE id = id_kling;

    DELETE FROM model_capabilities
    WHERE model_id = id_kling AND capability = 'text_to_video';
    INSERT INTO model_capabilities (model_id, capability)
    VALUES (id_kling, 'audio_to_video')
    ON CONFLICT DO NOTHING;

    INSERT INTO model_catalog_changes (model_id, field, from_value, to_value, evidence)
    VALUES (
      id_kling, 'activacion', 'descubierto: texto a vídeo',
      'precio_publicado: audio a vídeo',
      'Actualización 0051: familia y tarifas públicas de Kling AI Avatar Standard documentadas para la 0.29. No se han cambiado ajustes de administración.'
    );
  END IF;
END $$;
