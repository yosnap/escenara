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
 * - **no lleva a un personaje real**: ni un fotograma o clip generado con uno, ni un medio de una escena, un reparto o una
 *   exportación con personas reales. Sí valen los de personajes inventados, animados o mascotas y los subidos sin
 *   vínculo a ningún personaje. Enseñar a una persona real a todos los usuarios necesitaría un consentimiento propio.
 *
 * Todo se vuelve a comprobar al leerlo, no solo al elegirlo, porque un medio puede pasar a estar vinculado después.
 */

/** Persona real: un personaje de tipo persona que no es inventado. Las mascotas y los inventados no cuentan. */
const REAL = sql`c.kind = 'persona' and c.virtual = false`;

/**
 * Medios sin ningún vínculo a un personaje real: como resultado o punto de partida de un trabajo, en una escena o una
 * exportación de un proyecto cuyo reparto o protagonista es real, o como fotograma maestro de un personaje real.
 */
export function condicionSinPersonajeReal(): SQL {
  return sql`
    not exists (select 1 from generation_jobs j join characters c on c.id = j.character_id
      where (j.result_media_id = ${media.id} or j.source_media_id = ${media.id}) and ${REAL})
    and not exists (select 1 from scenes s
      where (s.approved_frame_media_id = ${media.id} or s.clip_media_id = ${media.id}
             or s.reference_image_media_id = ${media.id} or s.change_only_reference_media_id = ${media.id})
        and (exists (select 1 from scene_characters sc join characters c on c.id = sc.character_id
                     where sc.scene_id = s.id and ${REAL})
             or exists (select 1 from projects p join characters c on c.id = p.main_character_id
                        where p.id = s.project_id and ${REAL})))
    and not exists (select 1 from montage_exports e
      where e.result_media_id = ${media.id}
        and (exists (select 1 from projects p join characters c on c.id = p.main_character_id
                     where p.id = e.project_id and ${REAL})
             or exists (select 1 from scenes s join scene_characters sc on sc.scene_id = s.id
                        join characters c on c.id = sc.character_id
                        where s.project_id = e.project_id and ${REAL})))
    and not exists (select 1 from characters c where c.master_frame_media_id = ${media.id} and ${REAL})`;
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
        condicionSinPersonajeReal(),
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
      "Ese medio no existe, no es tuyo o no se puede usar como ejemplo (no valen los de otras personas ni los que llevan a un personaje real).",
    );
  if (!tipoDeDemo(medio.kind, medio.mimeType))
    throw new ErrorPreset(400, "Un ejemplo tiene que ser una imagen o un clip de vídeo.");
  return medio.id;
}
