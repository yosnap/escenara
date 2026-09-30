-- Los trends de la instalación dejan de fijar la duración y declaran qué parte de la dirección dictan.
--
-- Cada trend que cambia recibe una VERSIÓN NUEVA con su motivo; la anterior queda intacta en el historial y los
-- trabajos ya generados siguen citándola. Solo se miran trends de la instalación (sin dueño) no caducados (un caducado
-- solo se duplica).
--
-- Duración (criterio que no depende del nombre): se libera («cualquier duración») solo si el trend
--   * sigue admitiendo exactamente la duración que exigía antes de la 0.34.0 (`allowed_seconds = [target_seconds]`,
--     que es lo que dejó la migración anterior), y
--   * no restringe los modelos (`model_restrictions.modelos` vacío).
-- Un trend limitado a un modelo concreto se hizo para la duración que ese modelo cobra (las variantes de 5 s para
-- MiniMax H3): conserva su duración y su restricción. Uno con otra lista la decidió quien administra y no se toca.
--
-- «La dirección decide»: se rellena según el texto vigente cuando es exactamente uno de los que sembró Escenara (las
-- copias con el mismo texto reciben lo mismo que su original); con un texto editado a mano, nada (ante la duda, no se
-- bloquea ninguna categoría).
--
-- Escenas: solo pasan a citar la versión nueva las que están en borrador y no tienen nada elegido en las categorías
-- que decide el trend, porque para ellas el prompt no pierde nada de lo que eligió el usuario. Las demás (aprobadas,
-- producidas o con algo elegido en lo que ahora decide el trend) siguen citando la anterior: al producirlas, el
-- servidor dice que el trend tiene una versión nueva, con su causa, sin cobrar, y se actualizan guardando la escena.
--
-- Idempotente: un trend que ya tiene la duración y la dirección que le tocan no recibe otra versión.
DO $$
DECLARE
  t record;
  nuevo integer;
  decidida text;
  duraciones text;
  libera boolean;
BEGIN
  FOR t IN
    SELECT p."id", p."version", p."template", p."allowed_seconds", p."decided_direction", p."target_seconds",
      p."model_restrictions"
    FROM "prompt_templates" p
    WHERE p."owner_id" IS NULL
      AND p."kind" = 'trend'
      AND p."trend_status" IS DISTINCT FROM 'caducada'
    ORDER BY p."sort_order", p."slug"
    FOR UPDATE
  LOOP
    decidida := CASE t."template"
      WHEN 'First-person unboxing in one continuous close shot. Hands open the package and reveal the object naturally. Scene detail: {{escena}}. Keep the object physically inside the scene throughout.'
        THEN '["plano","angulo","camara"]'
      WHEN 'Show a subtle before-and-after change within one uninterrupted shot, using movement in the same space rather than a cut or transition. Scene detail: {{escena}}. If a product appears, it remains a physical object in the scene.'
        THEN '["camara"]'
      WHEN 'A calm morning routine in a lived-in room. The person reaches for and uses an object naturally without addressing the camera. Scene detail: {{escena}}. Keep the action simple enough for one shot.'
        THEN '["microaccion"]'
      WHEN 'An intimate close view of hands handling an object slowly, with attention to its natural texture and physical sounds. No music or staged performance. Scene detail: {{escena}}. The object stays in the real set.'
        THEN '["plano","microaccion"]'
      WHEN 'One hand turns an object slowly toward the camera as the camera makes one gentle move around it. No cut, no choreography and no graphic insert. Scene detail: {{escena}}. Preserve a plausible physical grip.'
        THEN '["camara","microaccion"]'
      ELSE '[]'
    END;

    libera := t."target_seconds" IS NOT NULL
      AND t."allowed_seconds" = json_build_array(t."target_seconds")::text
      AND (
        CASE WHEN jsonb_typeof(t."model_restrictions"::jsonb -> 'modelos') = 'array'
          THEN jsonb_array_length(t."model_restrictions"::jsonb -> 'modelos')
          ELSE 0
        END
      ) = 0;
    duraciones := CASE WHEN libera THEN '[]' ELSE t."allowed_seconds" END;

    CONTINUE WHEN duraciones = t."allowed_seconds" AND decidida = t."decided_direction";

    SELECT COALESCE(MAX(v."number"), 0) + 1 INTO nuevo
    FROM "prompt_template_versions" v
    WHERE v."template_id" = t."id";

    -- La versión nueva copia la vigente (texto, variables, restricciones y habla) y solo cambia lo que dicta el trend.
    INSERT INTO "prompt_template_versions" (
      "template_id", "number", "template", "variables", "model_restrictions", "trend_allows_speech",
      "allowed_seconds", "decided_direction", "change_reason"
    )
    SELECT v."template_id", nuevo, v."template", v."variables", v."model_restrictions", v."trend_allows_speech",
      duraciones, decidida,
      CASE WHEN libera
        THEN 'Duración libre: el trend deja de fijar los segundos (los decide el modelo o el proyecto) y la dirección deja en sus manos lo que su texto ya dicta. La versión anterior queda en el historial.'
        ELSE 'La dirección deja en manos del trend lo que su texto ya dicta. Conserva sus duraciones admitidas y su restricción de modelo. La versión anterior queda en el historial.'
      END
    FROM "prompt_template_versions" v
    WHERE v."template_id" = t."id"
    ORDER BY v."number" DESC
    LIMIT 1;

    UPDATE "prompt_templates"
    SET "allowed_seconds" = duraciones,
      "decided_direction" = decidida,
      "version" = nuevo,
      "updated_at" = now()
    WHERE "id" = t."id";

    UPDATE "scenes" s
    SET "template_version" = nuevo
    WHERE s."template_id" = t."id"
      AND s."template_version" = t."version"
      AND s."state" = 'borrador'
      AND (NOT (decidida::jsonb ? 'plano') OR s."shot_type" = '')
      AND (NOT (decidida::jsonb ? 'angulo') OR s."camera_angle" = '')
      AND (NOT (decidida::jsonb ? 'camara') OR s."camera_move" = '')
      AND (NOT (decidida::jsonb ? 'microaccion') OR s."micro_action" = '')
      AND (NOT (decidida::jsonb ? 'registro-estetico') OR s."aesthetic_register" = 'ugc_real');
  END LOOP;
END $$;
