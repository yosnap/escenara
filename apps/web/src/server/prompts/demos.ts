import { and, eq, inArray, isNotNull, isNull, type SQL, sql } from "drizzle-orm";
import {
  type DemoPlantilla,
  demoVisibleParaUsuarios,
  rutaDeDemo,
  textoAlternativoDeDemo,
  tipoDeDemo,
} from "@/lib/demo-plantilla";
import { leerAjustes } from "../ajustes";
import { db } from "../db/cliente";
import { type FilaPlantilla, media, promptTemplates, users } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { condicionMedioNoReservado } from "../personajes/uso-de-medio";
import { ErrorPreset } from "./errores";

/**
 * Ejemplo (imagen o clip) de las plantillas y los trends. Es **lectura**: no genera nada ni llama a ningún
 * proveedor, solo enlaza un medio que ya existe en la biblioteca.
 *
 * Un medio solo vale como ejemplo si cumple **todo** esto:
 *
 * - es **del propio administrador que lo elige**: nunca el de otro usuario ni el de otro administrador (el ejemplo lo
 *   ven todos, y la biblioteca de quien administra no es un escaparate de la de los demás). Al servirlo se comprueba que
 *   su dueño sigue siendo administrador, así que si pierde el rol sus ejemplos dejan de verse;
 * - está en la biblioteca (no en la papelera) y es imagen o vídeo;
 * - **no es material reservado** (documento de consentimiento, foto de un personaje o su hoja);
 * - **su origen es seguro, por lista blanca** (ver {@link condicionDeOrigenSeguro}): solo vale una subida directa que no
 *   está en ningún trabajo, escena ni personaje, o el resultado o punto de partida de un trabajo hecho con un personaje
 *   sintético (inventado, animado o mascota) que no es de un reparto de varias personas. Todo lo demás, incluido lo que no
 *   se sabe de dónde viene, se rechaza. Enseñar a una persona real a todos los usuarios necesitaría un consentimiento propio.
 *
 * Todo se vuelve a comprobar al leerlo, no solo al elegirlo, porque un medio puede pasar a estar vinculado después.
 */

/**
 * Nivel de exigencia de la lista blanca. `ejemplo` es el de los ejemplos de plantillas (admite una subida directa y una
 * mascota). `comunidad` es el de lo que un usuario publica para otros usuarios (decisión del propietario, 2026-09-30):
 * **toda** la cadena tiene que ser generada, así que además no vale ninguna subida directa, ni una mascota real, ni un
 * producto (sus fotos son subidas), ni un lugar con fotos, ni una imagen de referencia o un audio propio de la escena.
 */
export type NivelDeOrigen = "ejemplo" | "comunidad";

/** El medio de la consulta que usa estas condiciones, siempre calificado con su tabla. */
const MEDIO = sql.raw(`"media"."id"`);

/**
 * Personaje sintético. En `ejemplo`: inventado (y con él animado) o mascota. En `comunidad`: solo inventado y sin ninguna
 * foto original (una mascota real sale de fotos reales). Una persona real no lo es nunca.
 */
const sintetico = (c: string, nivel: NivelDeOrigen = "ejemplo") =>
  nivel === "comunidad"
    ? `(${c}.virtual = true and not exists (select 1 from character_references crs
        where crs.character_id = ${c}.id and crs.origin = 'foto_original'))`
    : `(${c}.virtual = true or ${c}.kind = 'animal')`;

/** Lugar sin ninguna foto real: generado y con todas sus referencias generadas. */
const lugarGenerado = (p: string) => `exists (select 1 from places pl where pl.id = ${p} and pl.origin = 'generado'
  and not exists (select 1 from place_references plr where plr.place_id = pl.id and plr.origin <> 'vista_generada'))`;

/**
 * Lo que la comunidad exige además al propio trabajo: sin producto y con lugar generado o sin lugar. Se mira lo que el
 * trabajo **conserva** aunque el producto o el lugar se borren (`product_action`, `brand_rights_at`, `place_version`):
 * borrar el producto no convierte en sintético lo que se hizo con sus fotos.
 */
const trabajoSinFotosSubidas = (j: string) => `(
  ${j}.product_id is null and ${j}.product_action = '' and ${j}.brand_rights_at is null and ${j}.digital_step = ''
  and ((${j}.place_id is null and ${j}.place_version is null) or (${j}.place_id is not null and ${lugarGenerado(`${j}.place_id`)})))`;

/** Base de un trabajo sintético: un solo personaje sintético, sin reparto, en lo que viajó al proveedor. */
const trabajoDeUnSintetico = (j: string, nivel: NivelDeOrigen) => `(
  ${j}.character_id is not null
  and exists (select 1 from characters cj where cj.id = ${j}.character_id and ${sintetico("cj", nivel)})
  and ${j}.cast_clip_order is null
  and jsonb_typeof(${j}.input) = 'object'
  and not jsonb_exists(${j}.input, 'reparto')
  and (jsonb_typeof(${j}.input->'personajesOmni') is distinct from 'array'
       or jsonb_array_length(${j}.input->'personajesOmni') <= 1))`;

/**
 * Cadena de partida generada (solo `comunidad`): la imagen de partida del trabajo, y la de partida de esa, y así hasta
 * el principio, tiene que ser **resultado** de trabajos sintéticos. Una subida en cualquier punto de la cadena la
 * rompe. Una cadena de más de cinco pasos no se da por buena: ante la duda, no se publica.
 */
const cadenaGenerada = (j: string) => `not exists (
  with recursive cadena(mid, n) as (
    select ${j}.source_media_id, 1 where ${j}.source_media_id is not null
    union
    select jp.source_media_id, c.n + 1 from cadena c join generation_jobs jp on jp.result_media_id = c.mid
    where jp.source_media_id is not null and c.n < 6)
  select 1 from cadena c
  where c.n >= 6
     or not exists (select 1 from generation_jobs jr where jr.result_media_id = c.mid)
     or exists (select 1 from generation_jobs jx where jx.result_media_id = c.mid
                and not (${trabajoDeUnSintetico("jx", "comunidad")} and ${trabajoSinFotosSubidas("jx")})))`;

/**
 * Trabajo hecho con **un solo** personaje sintético: con personaje, sin orden de reparto, y sin `reparto` ni más de un
 * personaje en lo que viajó al proveedor. La comprobación mira el propio trabajo, no el reparto de hoy: el reparto cambia,
 * y un clip de dos personas sigue siendo de dos personas aunque después se quite a una del reparto. En `comunidad`,
 * además sin fotos subidas en el trabajo ni en su cadena de partida.
 */
const trabajoSintetico = (j: string, nivel: NivelDeOrigen = "ejemplo") =>
  nivel === "comunidad"
    ? `(${trabajoDeUnSintetico(j, nivel)} and ${trabajoSinFotosSubidas(j)} and ${cadenaGenerada(j)})`
    : trabajoDeUnSintetico(j, nivel);

/**
 * Escena que nunca ha llevado a nadie más que a un personaje sintético: como mucho una persona en el reparto (y
 * sintética), el protagonista del proyecto sintético o ausente, sin grupo de podcast ni turnos de diálogo de personas
 * reales, y **todos** sus trabajos (los vigentes y las versiones anteriores) hechos con un personaje sintético. En
 * `comunidad`, además sin audio propio para cantar, sin imágenes de referencia, sin producto y con lugar generado.
 */
const escenaSintetica = (id: string, nivel: NivelDeOrigen = "ejemplo") => `(
  (select count(*) from scene_characters scx where scx.scene_id = ${id}) <= 1
  and not exists (select 1 from scene_characters scy join characters cy on cy.id = scy.character_id
                  where scy.scene_id = ${id} and not ${sintetico("cy", nivel)})
  and not exists (select 1 from scenes sz join projects pz on pz.id = sz.project_id
                  join characters cz on cz.id = pz.main_character_id
                  where sz.id = ${id} and not ${sintetico("cz", nivel)})
  and not exists (select 1 from scenes sw where sw.id = ${id} and sw.podcast_group_id is not null)
  and not exists (select 1 from scene_dialogue_turns tt join characters ct on ct.id = tt.character_id
                  where tt.scene_id = ${id} and not ${sintetico("ct", nivel)})
  and not exists (select 1 from generation_jobs j2 where j2.scene_id = ${id} and not ${trabajoSintetico("j2", nivel)})${
    nivel === "comunidad"
      ? `
  and not exists (select 1 from scenes sv join projects pv on pv.id = sv.project_id where sv.id = ${id}
                  and (sv.singing_audio_media_id is not null or sv.reference_image_media_id is not null
                       or sv.change_only_reference_media_id is not null or sv.product_id is not null
                       or (sv.place_id is not null and not ${lugarGenerado("sv.place_id")})
                       or (pv.default_place_id is not null and not ${lugarGenerado("pv.default_place_id")})))`
      : ""
  })`;

/**
 * **Lista blanca de origen**: un medio solo puede ser ejemplo si cumple una de estas dos cosas, y ninguna exclusión.
 *
 * - **(A)** Es una subida directa: no está en ningún trabajo, escena ni exportación. **Nunca en `comunidad`**.
 * - **(B)** Es el resultado o el punto de partida de trabajos hechos con un personaje sintético, y toda escena en la que
 *   aparece es sintética ({@link escenaSintetica}). En `comunidad` tiene que ser además **resultado** de un trabajo.
 *
 * Exclusión sin excepción: ningún medio que sea referencia, hoja o fotograma maestro de un personaje, ni que esté en
 * **cualquier versión** de un personaje (aunque la foto se haya quitado después del personaje), ni resultado de una
 * exportación. Un medio cuyo origen no se puede determinar (una escena sin trabajo que lo explique) queda fuera.
 */
export function condicionDeOrigenSeguro(nivel: NivelDeOrigen = "ejemplo"): SQL {
  // Calificada a mano: Drizzle escribe `"id"` a secas en los campos de un `select` de una sola tabla, y dentro de las
  // subconsultas de abajo eso sería el `id` de otra tabla.
  const m = MEDIO;
  const subidaDirecta = sql`(not exists (select 1 from generation_jobs ja where ja.result_media_id = ${m} or ja.source_media_id = ${m})
       and not exists (select 1 from scenes sa where sa.approved_frame_media_id = ${m} or sa.clip_media_id = ${m}
                       or sa.reference_image_media_id = ${m} or sa.change_only_reference_media_id = ${m}))
      or`;
  const generado =
    nivel === "comunidad"
      ? sql`exists (select 1 from generation_jobs jb where jb.result_media_id = ${m})`
      : sql`exists (select 1 from generation_jobs jb where jb.result_media_id = ${m} or jb.source_media_id = ${m})`;
  return sql`
    not exists (select 1 from character_versions cv where cv.sheet_media_id = ${m} or jsonb_exists(cv.reference_media_ids, ${m}::text))
    and not exists (select 1 from character_references cr where cr.media_id = ${m})
    and not exists (select 1 from characters cc where cc.master_frame_media_id = ${m} or cc.identity_sheet_media_id = ${m})
    and not exists (select 1 from montage_exports e where e.result_media_id = ${m})
    and (
      ${nivel === "comunidad" ? sql`` : subidaDirecta}
      (${generado}
       and not exists (select 1 from generation_jobs jm
                       where (jm.result_media_id = ${m} or jm.source_media_id = ${m})
                         and not (${sql.raw(trabajoSintetico("jm", nivel))}
                                  and (jm.scene_id is null or ${sql.raw(escenaSintetica("jm.scene_id", nivel))})))
       and not exists (select 1 from scenes sm
                       where (sm.approved_frame_media_id = ${m} or sm.clip_media_id = ${m}
                              or sm.reference_image_media_id = ${m} or sm.change_only_reference_media_id = ${m})
                         and not ${sql.raw(escenaSintetica("sm.id", nivel))}))
    )`;
}

/**
 * Personaje que se puede enseñar a otros usuarios (solo `comunidad`): inventado, sin ninguna foto original (ni ahora ni
 * en ninguna versión: cada foto de cada versión tiene que ser una vista generada suya o un resultado de sus trabajos), y
 * con su declaración de personaje inventado vigente. La columna es la del personaje de la consulta que la usa.
 */
export function condicionPersonajeSintetico(personajeId: SQL | string): SQL {
  const c = typeof personajeId === "string" ? sql`${personajeId}::uuid` : personajeId;
  return sql`exists (select 1 from characters ch where ch.id = ${c} and ${sql.raw(sintetico("ch", "comunidad"))}
    and exists (select 1 from consent_records crc where crc.character_id = ch.id and crc.revoked_at is null
                and crc.holder_type = 'inventado' and crc.synthetic_declared = true)
    and not exists (select 1 from character_versions cvv, jsonb_array_elements_text(cvv.reference_media_ids) r(mid)
                    where cvv.character_id = ch.id
                      and not exists (select 1 from character_references crg where crg.character_id = ch.id
                                      and crg.media_id::text = r.mid and crg.origin = 'vista_generada')
                      and not exists (select 1 from generation_jobs jg where jg.result_media_id::text = r.mid
                                      and jg.character_id = ch.id)))`;
}

/**
 * Imagen de un personaje sintético que se puede copiar a una publicación: resultado de un trabajo **de ese personaje**,
 * y todos los trabajos que la tocan sintéticos en `comunidad`. Así ni una foto subida ni la hoja 3×3 llegan a la galería.
 */
export function condicionImagenDelPersonaje(personajeId: string): SQL {
  const m = MEDIO;
  return sql`exists (select 1 from generation_jobs jp where jp.result_media_id = ${m} and jp.character_id = ${personajeId}::uuid)
    and not exists (select 1 from generation_jobs jq where (jq.result_media_id = ${m} or jq.source_media_id = ${m})
                    and not ${sql.raw(trabajoSintetico("jq", "comunidad"))})
    and not exists (select 1 from characters ci where ci.identity_sheet_media_id = ${m})
    and not exists (select 1 from character_versions cvi where cvi.sheet_media_id = ${m})`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filas del medio que sí pueden hacer de ejemplo, por identificador de medio. */
async function mediosValidos(ids: readonly string[]) {
  if (ids.length === 0) return [];
  return await db()
    .select({
      id: media.id,
      ownerId: media.ownerId,
      kind: media.kind,
      mimeType: media.mimeType,
      storageKey: media.storageKey,
      width: media.width,
      height: media.height,
      altEs: media.altEs,
      title: media.title,
    })
    .from(media)
    .where(
      and(
        inArray(media.id, [...ids]),
        isNull(media.deletedAt),
        condicionMedioNoReservado(),
        condicionDeOrigenSeguro("ejemplo"),
        // Solo cuentan los medios de quien sigue siendo administrador.
        inArray(media.ownerId, db().select({ id: users.id }).from(users).where(eq(users.role, "admin"))),
      ),
    );
}

/**
 * Vista del ejemplo de cada plantilla que tenga uno, por identificador de plantilla. Una plantilla cuyo medio ya no
 * sirve (papelera, reservado, tipo no admitido) queda sin ejemplo en la vista.
 */
export async function demosDe(filas: readonly FilaPlantilla[]): Promise<Map<string, DemoPlantilla>> {
  const conDemo = filas.filter((f) => f.demoMediaId !== null);
  const salida = new Map<string, DemoPlantilla>();
  if (conDemo.length === 0) return salida;
  const validos = new Map(
    (await mediosValidos(conDemo.map((f) => f.demoMediaId as string))).map((m) => [m.id, m] as const),
  );
  for (const fila of conDemo) {
    const medio = validos.get(fila.demoMediaId as string);
    // Solo vale si el medio sigue siendo de quien lo puso.
    const tipo = medio && medio.ownerId === fila.demoSetBy ? tipoDeDemo(medio.kind, medio.mimeType) : null;
    if (!medio || !tipo) continue;
    salida.set(fila.id, {
      tipo,
      url: rutaDeDemo(fila.id, medio.id),
      alt: textoAlternativoDeDemo(medio, fila.name, tipo),
      ancho: medio.width,
      alto: medio.height,
    });
  }
  return salida;
}

/** Lo que hace falta para servir el archivo de un ejemplo. */
export interface ArchivoDeDemo {
  clave: string;
  mime: string;
}

/**
 * Archivo del ejemplo de una plantilla **para quien lo pide**. Quien administra ve el de cualquier plantilla de la
 * instalación; el resto, solo el de una plantilla que se le ofrece (activa y, si es un trend, vigente con los trends
 * visibles). Todo lo demás responde 404, sin distinguir «no existe» de «no es para ti».
 */
export async function archivoDeDemo(actor: Actor, plantillaId: string): Promise<ArchivoDeDemo> {
  const [fila] = await db()
    .select()
    .from(promptTemplates)
    .where(
      and(eq(promptTemplates.id, plantillaId), isNull(promptTemplates.ownerId), isNotNull(promptTemplates.demoMediaId)),
    )
    .limit(1);
  if (!fila?.demoMediaId) throw new ErrorPreset(404, "Esa plantilla no tiene ejemplo.");
  if (!actor.esAdmin) {
    const visible = demoVisibleParaUsuarios(
      {
        deLaInstalacion: true,
        activa: fila.active,
        kind: fila.kind,
        trendStatus: fila.trendStatus,
      },
      (await leerAjustes()).trendsVisibles,
    );
    if (!visible) throw new ErrorPreset(404, "Esa plantilla no tiene ejemplo.");
  }
  const [medio] = await mediosValidos([fila.demoMediaId]);
  if (!medio || medio.ownerId !== fila.demoSetBy || !tipoDeDemo(medio.kind, medio.mimeType))
    throw new ErrorPreset(404, "Esa plantilla no tiene ejemplo.");
  // El tipo se sirve limpio (sin parámetros): ya se comprobó contra la lista de los que se admiten.
  return { clave: medio.storageKey, mime: medio.mimeType.split(";")[0]?.trim().toLowerCase() ?? "" };
}

/**
 * Comprueba que un medio puede hacer de ejemplo y devuelve su identificador. Tiene que ser **del administrador que lo
 * elige** (`autorId`): el de otro usuario, el de otro administrador, uno en la papelera, uno reservado o uno vinculado a
 * un personaje real responden 404 sin distinguir la causa (no se revela qué medios existen); uno que no es imagen ni
 * vídeo, 400; y un identificador mal escrito, 400 con su causa.
 */
export async function exigirMedioParaDemo(medioId: string, autorId: string): Promise<string> {
  if (!UUID.test(medioId))
    throw new ErrorPreset(400, "El identificador del medio no es válido: elígelo de la biblioteca.");
  const [medio] = await mediosValidos([medioId]);
  if (!medio || medio.ownerId !== autorId)
    throw new ErrorPreset(
      404,
      "Ese medio no existe, no es tuyo o no se puede usar como ejemplo (no valen los de otras personas ni los que puedan llevar a una persona real).",
    );
  if (!tipoDeDemo(medio.kind, medio.mimeType))
    throw new ErrorPreset(400, "Un ejemplo tiene que ser una imagen o un clip de vídeo.");
  return medio.id;
}
