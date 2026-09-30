-- Los trends de la instalación dejan de fijar la duración y declaran qué parte de la dirección dictan.
--
-- Cada trend afectado recibe una VERSIÓN NUEVA con su motivo; la anterior queda intacta en el historial y los
-- trabajos ya generados siguen citándola. Qué se toca:
--   * trends de la instalación (sin dueño), no caducados (un caducado solo se duplica) y que todavía limitan la
--     duración;
--   * NO las variantes de 5 s (clave terminada en «-5s»): se conservan tal cual, con su duración y su versión.
-- «La dirección decide» solo se rellena cuando el texto vigente es exactamente el que sembró Escenara, porque es lo
-- único cuyo contenido se conoce; con un texto editado a mano se deja vacío (no se bloquea nada ante la duda).
--
-- Las escenas que citaban la versión anterior del trend pasan a citar la nueva, para que sigan siendo válidas: la
-- versión nueva solo relaja la duración y deja al trend lo que su texto ya pedía.
--
-- Idempotente: tras aplicarse, ningún trend afectado sigue limitando la duración y volver a ejecutarla no hace nada.
DO $$
DECLARE
  t record;
  nuevo integer;
  decidida text;
BEGIN
  FOR t IN
    SELECT p."id", p."version", p."template"
    FROM "prompt_templates" p
    WHERE p."owner_id" IS NULL
      AND p."kind" = 'trend'
      AND p."trend_status" IS DISTINCT FROM 'caducada'
      AND p."allowed_seconds" <> '[]'
      AND p."slug" NOT LIKE '%-5s'
    ORDER BY p."sort_order", p."slug"
    FOR UPDATE
  LOOP
    decidida := CASE t."template"
      WHEN 'First-person unboxing in one continuous close shot. Hands open the package and reveal the object naturally. Scene detail: {{escena}}. Keep the object physically inside the scene throughout.'
        THEN '["plano","angulo","camara"]'
      WHEN 'Show a subtle before-and-after change within one uninterrupted shot, using movement in the same space rather than a cut or transition. Scene detail: {{escena}}. If a product appears, it remains a physical object in the scene.'
        THEN '[]'
      WHEN 'A calm morning routine in a lived-in room. The person reaches for and uses an object naturally without addressing the camera. Scene detail: {{escena}}. Keep the action simple enough for one shot.'
        THEN '["microaccion"]'
      WHEN 'An intimate close view of hands handling an object slowly, with attention to its natural texture and physical sounds. No music or staged performance. Scene detail: {{escena}}. The object stays in the real set.'
        THEN '["plano","microaccion"]'
      WHEN 'One hand turns an object slowly toward the camera as the camera makes one gentle move around it. No cut, no choreography and no graphic insert. Scene detail: {{escena}}. Preserve a plausible physical grip.'
        THEN '["camara","microaccion"]'
      ELSE '[]'
    END;

    SELECT COALESCE(MAX(v."number"), 0) + 1 INTO nuevo
    FROM "prompt_template_versions" v
    WHERE v."template_id" = t."id";

    -- La versión nueva copia la vigente (texto, variables, restricciones y habla) y solo cambia lo que decide el trend.
    INSERT INTO "prompt_template_versions" (
      "template_id", "number", "template", "variables", "model_restrictions", "trend_allows_speech",
      "allowed_seconds", "decided_direction", "change_reason"
    )
    SELECT v."template_id", nuevo, v."template", v."variables", v."model_restrictions", v."trend_allows_speech",
      '[]', decidida,
      'Duración libre: el trend deja de fijar los segundos (los decide el modelo o el proyecto) y la dirección deja en sus manos lo que su texto ya dicta. La versión anterior queda en el historial.'
    FROM "prompt_template_versions" v
    WHERE v."template_id" = t."id"
    ORDER BY v."number" DESC
    LIMIT 1;

    UPDATE "prompt_templates"
    SET "allowed_seconds" = '[]',
      "decided_direction" = decidida,
      "version" = nuevo,
      "updated_at" = now()
    WHERE "id" = t."id";

    UPDATE "scenes"
    SET "template_version" = nuevo
    WHERE "template_id" = t."id" AND "template_version" = t."version";
  END LOOP;
END $$;
