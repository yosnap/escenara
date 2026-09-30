import { and, asc, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import { type Elegibilidad, MAXIMO_IMAGENES_PERSONAJE, type TipoPublicacion } from "@/lib/comunidad";
import type { Ejecutor } from "../db/cliente";
import { characterReferences, characters, generationJobs, media, promptTemplates } from "../db/esquema";
import { condicionMedioNoReservado } from "../personajes/uso-de-medio";
import { condicionDeOrigenSeguro, condicionImagenDelPersonaje, condicionPersonajeSintetico } from "../prompts/demos";
import { ErrorComunidad } from "./errores";
import { procedenciaDeMedio } from "./procedencia";

/**
 * **Elegibilidad de la comunidad: el único punto de verdad** de qué se puede publicar. La usan la interfaz (para
 * explicar por qué sí o por qué no), el servidor al publicar (dentro de la transacción, con los bloqueos tomados) y la
 * moderación (otra vez, al aprobar). Nadie más decide.
 *
 * La decisión es la **lista blanca de origen** de los ejemplos de plantilla (`condicionDeOrigenSeguro`) en su nivel más
 * estricto, `comunidad`: toda la cadena de origen tiene que ser generada con un personaje inventado, sin ninguna foto
 * subida (ni del usuario, ni de un producto, ni de un lugar), sin audio propio, sin reparto de dos personas. **Ante la
 * duda, no se publica.** Las columnas de diagnóstico de abajo solo **explican** el «no»; nunca lo convierten en un «sí».
 */

export type OrigenPublicable = { tipo: "personaje"; id: string } | { tipo: "medio"; id: string };

export interface MedioACopiar {
  id: string;
  clave: string;
  tipo: "imagen" | "video";
  mime: string;
  ancho: number | null;
  alto: number | null;
  duracion: number | null;
  alt: string;
}

export interface ResultadoElegibilidad extends Elegibilidad {
  nombre: string;
  descripcion: string;
  /** Tipos con los que se puede publicar este original. */
  tipos: TipoPublicacion[];
  /** Plantilla o trend de la instalación con el que se hizo el medio, si se hizo con uno activo. */
  plantilla: { id: string; nombre: string; tipo: "trend" | "plantilla" } | null;
  /** Lo que se copiaría a la publicación. Vacío si no es publicable. */
  medios: MedioACopiar[];
  /** Personaje inventado del que sale (el propio, o el del trabajo que produjo el archivo). Se fija al publicar. */
  personajeOrigen: string | null;
}

const MOTIVO_DUDA_MEDIO =
  "No se puede comprobar que toda su cadena de origen sea generada (por ejemplo, parte de una imagen subida, de una escena con otra persona o de una referencia). Ante la duda, no se publica.";

const tipoDeMedio = (kind: string): "imagen" | "video" | null =>
  kind === "imagen" ? "imagen" : kind === "video" ? "video" : null;

const mimeLimpio = (mime: string) => mime.split(";")[0]?.trim().toLowerCase() ?? "";

/** Elegibilidad de un original **del usuario**. Uno ajeno, borrado o inexistente responde 404 sin distinguir la causa. */
export async function elegibilidadDe(
  ej: Ejecutor,
  usuarioId: string,
  origen: OrigenPublicable,
): Promise<ResultadoElegibilidad> {
  // La regla es una consulta grande (cadena recursiva de lo enviado) y barata de ejecutar, pero su coste estimado hace
  // que PostgreSQL la compile con JIT, que tarda un segundo. Se apaga solo aquí (`set local`, en una transacción o en
  // una subtransacción de la de quien llama).
  return await ej.transaction(async (tx) => {
    await tx.execute(sql`set local jit = off`);
    return origen.tipo === "personaje"
      ? await elegibilidadDePersonaje(tx, usuarioId, origen.id)
      : await elegibilidadDeMedio(tx, usuarioId, origen.id);
  });
}

async function elegibilidadDePersonaje(ej: Ejecutor, usuarioId: string, id: string): Promise<ResultadoElegibilidad> {
  const [fila] = await ej
    .select({
      nombre: characters.name,
      descripcion: characters.description,
      virtual: characters.virtual,
      // Columnas calificadas a mano (`PERSONAJE`): en los campos de un `select` de una sola tabla, Drizzle escribiría
      // `"id"` a secas y dentro de cada subconsulta sería el `id` de otra tabla.
      sintetico: sql<boolean>`${condicionPersonajeSintetico(PERSONAJE)}`,
      // Cualquier referencia que no sea resultado de un trabajo suyo: foto original o subida marcada «hecha con IA».
      conFotos: sql<boolean>`exists (select 1 from character_references cf where cf.character_id = ${PERSONAJE}
        and not exists (select 1 from generation_jobs jf where jf.result_media_id = cf.media_id
                        and jf.character_id = ${PERSONAJE}))`,
      declarado: sql<boolean>`exists (select 1 from consent_records cd where cd.character_id = ${PERSONAJE}
        and cd.revoked_at is null and cd.holder_type = 'inventado' and cd.synthetic_declared = true)`,
    })
    .from(characters)
    .where(and(eq(characters.id, id), eq(characters.ownerId, usuarioId)))
    .limit(1);
  if (!fila) throw new ErrorComunidad(404, "Ese personaje no existe o no es tuyo.");

  const medios = fila.sintetico ? await imagenesDelPersonaje(ej, usuarioId, id) : [];
  const motivos: string[] = [];
  if (!fila.virtual) {
    motivos.push(
      "Es un personaje hecho con fotos reales (una persona o una mascota real): nunca se publica. Si quieres enseñar la plataforma, crea un personaje inventado solo para eso y publica ese.",
    );
  } else {
    if (fila.conFotos)
      motivos.push(
        "Tiene imágenes que no generó la plataforma (una foto subida, aunque se marcara como hecha con IA): solo se publica un personaje sin ninguna.",
      );
    if (!fila.declarado) motivos.push("Le falta la declaración vigente de personaje inventado.");
    if (!fila.sintetico && !fila.conFotos && fila.declarado) {
      motivos.push(
        "Alguna versión de su ficha incluye una imagen que no es una vista generada suya. Ante la duda, no se publica.",
      );
    }
    if (fila.sintetico && medios.length === 0) {
      motivos.push("Todavía no tiene retrato ni vistas generadas que enseñar: genera su retrato primero.");
    }
  }
  const publicable = motivos.length === 0 && fila.sintetico && medios.length > 0;
  return {
    publicable,
    motivos: publicable ? [] : motivos.length > 0 ? motivos : ["No se puede comprobar que sea sintético."],
    nombre: fila.nombre,
    personajeOrigen: id,
    descripcion: fila.descripcion,
    tipos: ["personaje"],
    plantilla: null,
    medios: publicable ? medios : [],
  };
}

/** Retrato maestro y vistas generadas del personaje, en su orden, que pasan la lista blanca. Nunca la hoja 3×3. */
async function imagenesDelPersonaje(ej: Ejecutor, usuarioId: string, id: string): Promise<MedioACopiar[]> {
  const [personaje] = await ej
    .select({ maestro: characters.masterFrameMediaId })
    .from(characters)
    .where(eq(characters.id, id))
    .limit(1);
  const vistas = await ej
    .select({ id: characterReferences.mediaId })
    .from(characterReferences)
    .where(and(eq(characterReferences.characterId, id), eq(characterReferences.origin, "vista_generada")))
    .orderBy(asc(characterReferences.sortOrder), asc(characterReferences.createdAt));
  const ids = [...new Set([personaje?.maestro, ...vistas.map((v) => v.id)].filter((v): v is string => !!v))];
  if (ids.length === 0) return [];
  const filas = await ej
    .select()
    .from(media)
    .where(
      and(
        inArray(media.id, ids),
        eq(media.ownerId, usuarioId),
        isNull(media.deletedAt),
        eq(media.kind, "imagen"),
        eq(media.isDocument, false),
        condicionImagenDelPersonaje(id),
      ),
    );
  const porId = new Map(filas.map((f) => [f.id, f]));
  return ids
    .flatMap((mid) => {
      const f = porId.get(mid);
      return f
        ? [
            {
              id: f.id,
              clave: f.storageKey,
              tipo: "imagen" as const,
              mime: mimeLimpio(f.mimeType),
              ancho: f.width,
              alto: f.height,
              duracion: null,
              // Nunca el texto alternativo que escribió el usuario: la vista pública pone uno propio con el título.
              alt: "",
            },
          ]
        : [];
    })
    .slice(0, MAXIMO_IMAGENES_PERSONAJE);
}

const MEDIO = sql.raw(`"media"."id"`);
const PERSONAJE = sql.raw(`"characters"."id"`);

/** `true` si el medio cumple la condición (evaluada en el `where`, con sus columnas calificadas). */
async function cumple(ej: Ejecutor, id: string, condicion: SQL | undefined): Promise<boolean> {
  const [fila] = await ej
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, id), condicion))
    .limit(1);
  return Boolean(fila);
}

/** Trabajos que tocan el medio (como resultado o como partida), para las columnas de diagnóstico. */
const tocan = (condicion: string) =>
  sql.raw(`exists (select 1 from generation_jobs jd where (jd.result_media_id = media.id or jd.source_media_id = media.id)
    and ${condicion})`);

async function elegibilidadDeMedio(ej: Ejecutor, usuarioId: string, id: string): Promise<ResultadoElegibilidad> {
  const [fila] = await ej
    .select({
      id: media.id,
      kind: media.kind,
      mime: media.mimeType,
      clave: media.storageKey,
      ancho: media.width,
      alto: media.height,
      duracion: media.durationSeconds,
      titulo: media.title,
      nombreOriginal: media.originalName,
      generado: sql<boolean>`exists (select 1 from generation_jobs jg where jg.result_media_id = ${MEDIO})`,
      personaReal: tocan(
        "exists (select 1 from characters cr where cr.id = jd.character_id and (cr.virtual = false or exists (select 1 from character_references cf where cf.character_id = cr.id and cf.origin = 'foto_original')))",
      ),
      sinPersonaje: tocan("jd.character_id is null"),
      personajeOrigen: sql<
        string | null
      >`(select jo.character_id from generation_jobs jo where jo.result_media_id = ${MEDIO}
        order by jo.created_at desc limit 1)`,
      origenDeclarado: sql<boolean>`exists (select 1 from generation_jobs jo join consent_records co on co.character_id = jo.character_id
        where jo.result_media_id = ${MEDIO} and co.revoked_at is null and co.holder_type = 'inventado' and co.synthetic_declared = true)`,
      conProducto: tocan("(jd.product_id is not null or jd.product_action <> '' or jd.brand_rights_at is not null)"),
      conLugar: tocan("(jd.place_id is not null or jd.place_version is not null)"),
      reparto: tocan(
        "(jd.cast_clip_order is not null or jsonb_exists(jd.input, 'reparto') or (jsonb_typeof(jd.input->'personajesOmni') = 'array' and jsonb_array_length(jd.input->'personajesOmni') > 1))",
      ),
      // El audio se mira en lo que el trabajo guardó al encolarse (canto, audio de referencia) y en la escena de hoy.
      audioPropio: sql<boolean>`(${tocan(
        "(jd.input->>'canto' = 'true' or (coalesce(jd.input->>'audioDeReferencia', '') <> '' and not exists (select 1 from voice_samples vs where vs.media_id::text = jd.input->>'audioDeReferencia')))",
      )} or exists (select 1 from scenes sa where (sa.clip_media_id = ${MEDIO}
        or sa.approved_frame_media_id = ${MEDIO}) and sa.singing_audio_media_id is not null))`,
    })
    .from(media)
    .where(and(eq(media.id, id), eq(media.ownerId, usuarioId), isNull(media.deletedAt)))
    .limit(1);
  if (!fila) throw new ErrorComunidad(404, "Ese archivo no existe o no es tuyo.");
  // Las dos condiciones que deciden se evalúan en el `where`, como en los ejemplos de plantilla: son las mismas funciones.
  const [noReservado, origenSeguro] = await Promise.all([
    cumple(ej, id, condicionMedioNoReservado()),
    cumple(ej, id, condicionDeOrigenSeguro("comunidad")),
  ]);
  const decide = { ...fila, noReservado, origenSeguro };

  const tipo = tipoDeMedio(fila.kind);
  const plantilla = tipo ? await plantillaDelMedio(ej, id) : null;
  const motivos: string[] = [];
  if (!tipo) motivos.push("Solo se publican imágenes o clips de vídeo: un audio podría ser una voz real.");
  if (!decide.noReservado)
    motivos.push("Es material reservado (un documento de consentimiento, una foto o la hoja de un personaje).");
  if (!fila.generado)
    motivos.push("Es una subida tuya, no algo generado aquí: solo se publica lo generado de principio a fin.");
  if (fila.personaReal) motivos.push("Sale de un personaje que no es inventado (una persona o una mascota real).");
  if (fila.generado && !fila.sinPersonaje && !fila.personaReal && !fila.origenDeclarado)
    motivos.push("El personaje con el que se hizo ya no tiene vigente su declaración de personaje inventado.");
  if (fila.sinPersonaje) motivos.push("Se generó sin personaje: no se puede comprobar que no salga una persona real.");
  if (fila.conProducto) motivos.push("Lleva un producto: sus fotos son subidas, y en la comunidad no entra ninguna.");
  if (fila.conLugar && !decide.origenSeguro)
    motivos.push("Lleva un lugar con fotos (o ya borrado): solo vale un lugar generado sin fotos.");
  if (fila.reparto) motivos.push("Es de un reparto de dos personajes o de un podcast.");
  if (fila.audioPropio) motivos.push("Su escena canta con un audio subido, que podría ser una voz real.");
  if (!decide.origenSeguro && fila.generado) {
    // Qué se envió al generarlo y no es sintético (o no se puede comprobar): el primer paso que falla, con su origen.
    const falla = (await procedenciaDeMedio(ej, id)).find((e) => e.paso > 0 && !e.seguro);
    if (falla) motivos.push(`Algo que se envió al generarlo no vale. ${falla.descripcion}.`);
  }
  if (!decide.origenSeguro && motivos.length === 0) motivos.push(MOTIVO_DUDA_MEDIO);

  const publicable = tipo !== null && decide.noReservado && decide.origenSeguro && motivos.length === 0;
  const tipos: TipoPublicacion[] = ["clip"];
  if (plantilla) tipos.push(plantilla.tipo);
  return {
    publicable,
    motivos: publicable ? [] : motivos,
    nombre: fila.titulo || fila.nombreOriginal,
    personajeOrigen: fila.personajeOrigen,
    descripcion: "",
    tipos,
    plantilla,
    medios:
      publicable && tipo
        ? [
            {
              id: fila.id,
              clave: fila.clave,
              tipo,
              mime: mimeLimpio(fila.mime),
              ancho: fila.ancho,
              alto: fila.alto,
              duracion: fila.duracion,
              alt: "",
            },
          ]
        : [],
  };
}

/**
 * Plantilla o trend **de la instalación** con el que salió el medio (el trabajo más reciente que lo produjo). Solo si
 * sigue activa: una plantilla retirada no se puede ofrecer para «usar». Nunca su texto.
 */
async function plantillaDelMedio(ej: Ejecutor, medioId: string): Promise<ResultadoElegibilidad["plantilla"]> {
  const [fila] = await ej
    .select({ id: promptTemplates.id, nombre: promptTemplates.name, kind: promptTemplates.kind })
    .from(generationJobs)
    .innerJoin(promptTemplates, eq(promptTemplates.id, generationJobs.promptTemplateId))
    .where(
      and(
        eq(generationJobs.resultMediaId, medioId),
        isNull(promptTemplates.ownerId),
        eq(promptTemplates.active, true),
        or(eq(promptTemplates.kind, "base"), eq(promptTemplates.trendStatus, "vigente")),
      ),
    )
    .orderBy(sql`${generationJobs.createdAt} desc`)
    .limit(1);
  if (!fila) return null;
  return { id: fila.id, nombre: fila.nombre, tipo: fila.kind === "trend" ? "trend" : "plantilla" };
}
