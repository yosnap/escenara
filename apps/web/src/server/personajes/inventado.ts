import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { ETIQUETA_VISTA } from "@/lib/captura-personaje";
import type { TrabajoVista } from "@/lib/generacion";
import type { Medio } from "@/lib/media/tipos";
import { motivoNombreReal, nombresRealesEn } from "@/lib/nombres-reales";
import { DECLARACION_PERSONAJE_INVENTADO, MOTIVO_SIN_FOTOS_REALES, RETRATOS_CANDIDATOS } from "@/lib/omni";
import {
  DESCRIPCION_MAXIMA,
  MAXIMO_REFERENCIAS,
  NOMBRE_MAXIMO,
  type PersonajeVista,
  type TipoPersonaje,
} from "@/lib/personajes";
import { db } from "../db/cliente";
import {
  characterReferences,
  characters,
  consentRecords,
  type FilaPersonaje,
  generationJobs,
  media,
} from "../db/esquema";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import { crearFotograma } from "../generacion/servicio";
import { type Actor, aDto } from "../media/servicio";
import { claveDerivada } from "../produccion/producir";
import { filaPropia, recalcularEstado, siguienteOrden } from "./consulta";
import { ErrorPersonaje } from "./errores";
import { crearPersonaje, fichaDePersonaje } from "./servicio";
import { medidasDelMedio } from "./vista-sintetica";

/**
 * Personajes **inventados** (RF02 y RF10, 0.22.0): no existen, nacen de una descripción y su cara se genera.
 *
 * Existen para poder hacer UGC sin fingir un consentimiento que no hay. Y por eso llevan reglas propias, todas
 * comprobadas en el servidor:
 *
 * - **no admiten fotos reales**, ni subidas ni de la biblioteca: sus vistas salen del retrato generado. Si
 *   admitieran una, «inventado» dejaría de significar nada y la declaración sería falsa sin que nadie lo notara;
 * - **su texto no puede nombrar a personas reales** (`lib/nombres-reales.ts`): describir al personaje como
 *   alguien concreto es pedirle al proveedor la cara de alguien que no ha consentido nada;
 * - **no piden documento ni declaración de mayoría de edad**: no hay ninguna persona cuya edad declarar. Lo que
 *   se registra en su lugar, con la cuenta y la fecha, es que es inventado y no representa a nadie real;
 * - lo que generen va marcado como contenido sintético, que es lo que recogerá la exportación de la 0.23.0.
 *
 * El retrato se elige entre **cuatro candidatos** generados con el modelo de imagen del mapa: cada uno cuesta lo
 * que cuesta un fotograma, con su estimación y su confirmación, y se encolan de uno en uno por el mismo camino
 * de dinero que cualquier otro envío.
 */

/** Ningún texto de un personaje inventado puede nombrar a una persona real. Lo comprueba el servidor. */
export function exigirTextoSinPersonasReales(...textos: readonly string[]): void {
  const nombres = [...new Set(textos.flatMap((texto) => nombresRealesEn(texto)))];
  if (nombres.length > 0) throw new ErrorPersonaje(422, motivoNombreReal(nombres));
}

/** `true` si el personaje es inventado. Se lee de su fila: es una puerta que se cruza en cada foto y cada texto. */
export const esPersonajeInventado = (personaje: FilaPersonaje): boolean => personaje.virtual;

/**
 * Un personaje inventado no admite fotos. Se llama desde `anadirReferencias`, que es la **única** puerta por la
 * que entra una foto de la biblioteca; sus vistas generadas no pasan por ahí, sino por el cierre del trabajo que
 * las genera.
 */
export function exigirSinFotosReales(personaje: FilaPersonaje): void {
  if (personaje.virtual) throw new ErrorPersonaje(409, MOTIVO_SIN_FOTOS_REALES);
}

export interface DatosPersonajeInventado {
  nombre: unknown;
  descripcion: unknown;
  tipo?: unknown;
  /** Declaración de que es inventado y no representa a nadie real. Obligatoria. */
  declaracion: unknown;
}

/**
 * Crea un personaje inventado con su declaración registrada. El consentimiento se registra **aquí y no por el
 * camino normal**: el titular `inventado` no declara mayoría de edad ni sube documento, así que pasar por
 * `registrarConsentimiento` significaría relajar dos comprobaciones que tienen que seguir siendo duras para todo
 * lo demás.
 */
export async function crearPersonajeInventado(actor: Actor, datos: DatosPersonajeInventado): Promise<PersonajeVista> {
  if (datos.declaracion !== true) {
    throw new ErrorPersonaje(
      400,
      `Tienes que declarar lo siguiente para crearlo: «${DECLARACION_PERSONAJE_INVENTADO}»`,
    );
  }
  const nombre = typeof datos.nombre === "string" ? datos.nombre.trim() : "";
  const descripcion = typeof datos.descripcion === "string" ? datos.descripcion.trim() : "";
  if (nombre === "" || nombre.length > NOMBRE_MAXIMO) {
    throw new ErrorPersonaje(400, `Ponle un nombre de hasta ${NOMBRE_MAXIMO} caracteres.`);
  }
  if (descripcion.length < 20 || descripcion.length > DESCRIPCION_MAXIMA) {
    throw new ErrorPersonaje(
      400,
      `Descríbelo con entre 20 y ${DESCRIPCION_MAXIMA} caracteres: de esa descripción salen sus retratos, así que es lo único que decide qué cara tendrá.`,
    );
  }
  exigirTextoSinPersonasReales(nombre, descripcion);
  const tipo: TipoPersonaje = datos.tipo === "animal" ? "animal" : "persona";

  const creado = await crearPersonaje(actor, { nombre, tipo, descripcion });
  await db().transaction(async (tx) => {
    await tx.update(characters).set({ virtual: true, updatedAt: new Date() }).where(eq(characters.id, creado.id));
    await tx.insert(consentRecords).values({
      characterId: creado.id,
      holderType: "inventado",
      // No hay ninguna persona cuya edad declarar; lo que se declara es que no representa a nadie real.
      adultDeclared: false,
      syntheticDeclared: true,
      registeredBy: actor.id,
    });
  });
  await recalcularEstado(creado.id);
  return fichaDePersonaje(actor, creado.id);
}

/** Lo que el navegador confirma para generar los retratos candidatos. Es la confirmación de gasto de siempre. */
export interface ConfirmacionRetratos {
  creditosConfirmados: number;
  derechos: boolean;
  claveIdempotencia: string;
  selloEstimacion?: string;
  modelo?: string;
  avisoUmbralAceptado?: boolean;
  avisosConfirmados?: string[];
}

/**
 * Encola los cuatro retratos candidatos del personaje inventado a partir de su descripción.
 *
 * Cada candidato es **un trabajo con su propio coste**, y los créditos que se confirman son los de uno: el
 * diálogo de gasto multiplica por cuatro lo que enseña, y cada envío se mide contra el mismo tope que cualquier
 * otro. Si uno se rechaza (por un tope, por el presupuesto), se para ahí y se devuelve lo que sí se ha encolado:
 * lo encolado es un hecho con su reserva apartada.
 */
export async function generarRetratosCandidatos(
  actor: Actor,
  id: unknown,
  confirmacion: ConfirmacionRetratos,
  h: Herramientas = HERRAMIENTAS,
): Promise<{ trabajos: TrabajoVista[] }> {
  const personaje = await filaPropia(actor, id);
  if (!personaje.virtual) {
    throw new ErrorPersonaje(
      409,
      "Los retratos candidatos son de los personajes inventados: los demás se crean con sus fotos.",
    );
  }
  if (personaje.description.trim() === "") {
    throw new ErrorPersonaje(409, "Describe primero al personaje: de su descripción salen los retratos.");
  }
  exigirTextoSinPersonasReales(personaje.name, personaje.description);
  const [yaTiene] = await db()
    .select({ total: count() })
    .from(characterReferences)
    .where(eq(characterReferences.characterId, personaje.id));
  if ((yaTiene?.total ?? 0) >= MAXIMO_REFERENCIAS) {
    throw new ErrorPersonaje(409, `Este personaje ya tiene el máximo de ${MAXIMO_REFERENCIAS} fotos.`);
  }

  const trabajos: TrabajoVista[] = [];
  for (let candidato = 1; candidato <= RETRATOS_CANDIDATOS; candidato++) {
    try {
      const envio = await crearFotograma(
        actor,
        {
          prompt: personaje.description,
          personajeId: personaje.id,
          retratoInventado: true,
          derechos: confirmacion.derechos,
          creditosConfirmados: confirmacion.creditosConfirmados,
          claveIdempotencia: claveDerivada(confirmacion.claveIdempotencia, "retrato", personaje.id, String(candidato)),
          ...(confirmacion.selloEstimacion === undefined ? {} : { selloEstimacion: confirmacion.selloEstimacion }),
          ...(confirmacion.modelo === undefined ? {} : { modelo: confirmacion.modelo }),
          ...(confirmacion.avisoUmbralAceptado === undefined
            ? {}
            : { avisoUmbralAceptado: confirmacion.avisoUmbralAceptado }),
          ...(confirmacion.avisosConfirmados === undefined
            ? {}
            : { avisosConfirmados: confirmacion.avisosConfirmados }),
        },
        h,
      );
      trabajos.push(envio.trabajo);
    } catch (error) {
      // Si no ha salido ninguno, el error es la respuesta a lo que se pidió; si alguno salió, se para y se
      // devuelve lo encolado: ya tiene su reserva apartada y decir que no se ha hecho nada sería falso.
      if (trabajos.length === 0) throw error;
      break;
    }
  }
  return { trabajos };
}

/** Un retrato candidato ya generado: su medio y el trabajo del que salió. */
export interface RetratoCandidato {
  trabajoId: string;
  medioId: string;
}

/** Retratos candidatos de este personaje que ya están listos, del más reciente al más antiguo. */
export async function retratosCandidatos(personajeId: string): Promise<RetratoCandidato[]> {
  const filas = await db()
    .select({ id: generationJobs.id, medioId: generationJobs.resultMediaId, entrada: generationJobs.input })
    .from(generationJobs)
    .where(and(eq(generationJobs.characterId, personajeId), eq(generationJobs.state, "listo")))
    .orderBy(desc(generationJobs.createdAt))
    .limit(20);
  return filas
    .filter((f) => (f.entrada as { retratoInventado?: unknown }).retratoInventado === true && f.medioId !== null)
    .map((f) => ({ trabajoId: f.id, medioId: f.medioId as string }));
}

/**
 * Elige uno de los candidatos como retrato del personaje: se guarda como referencia **marcada como vista
 * generada** —nunca como foto, porque no lo es— y de frente, que es la vista que da identidad.
 *
 * Los demás candidatos **no se borran**: están pagados y siguen en la biblioteca del usuario, que decide qué
 * hacer con ellos. Lo único que cambia es cuál es la cara del personaje.
 */
export async function elegirRetrato(actor: Actor, id: unknown, medioId: unknown): Promise<PersonajeVista> {
  const personaje = await filaPropia(actor, id);
  if (!personaje.virtual) {
    throw new ErrorPersonaje(409, "Solo los personajes inventados eligen su retrato entre candidatos.");
  }
  if (typeof medioId !== "string") throw new ErrorPersonaje(400, "Elige uno de los retratos generados.");
  const candidatos = await retratosCandidatos(personaje.id);
  if (!candidatos.some((c) => c.medioId === medioId)) {
    throw new ErrorPersonaje(404, "Ese retrato no es uno de los candidatos generados para este personaje.");
  }
  const [fila] = await db()
    .select({ id: media.id })
    .from(media)
    .where(and(eq(media.id, medioId), eq(media.ownerId, actor.id), isNull(media.deletedAt)))
    .limit(1);
  if (!fila) throw new ErrorPersonaje(404, "Ese retrato ya no está en tu biblioteca.");

  const analisis = await medidasDelMedio(medioId);
  await db()
    .insert(characterReferences)
    .values({
      characterId: personaje.id,
      mediaId: medioId,
      // Nunca `foto_original`: este retrato lo ha generado un modelo y la ficha tiene que decirlo siempre.
      origin: "vista_generada",
      viewKey: "frontal",
      declaredView: ETIQUETA_VISTA.frontal,
      width: analisis?.metricas.ancho ?? null,
      height: analisis?.metricas.alto ?? null,
      sharpness: analisis?.metricas.nitidez ?? null,
      brightness: analisis?.metricas.luminosidad ?? null,
      phash: analisis?.huella ?? null,
      sortOrder: await siguienteOrden(personaje.id),
    })
    .onConflictDoNothing();
  await recalcularEstado(personaje.id);
  return fichaDePersonaje(actor, personaje.id);
}

/**
 * Retratos candidatos con su medio resuelto, para que la pantalla los pueda enseñar juntos. Los que ya son
 * referencia del personaje quedan fuera: esos ya son su cara, no un candidato por elegir.
 */
export async function mediosDeCandidatos(actor: Actor, personajeId: string): Promise<Medio[]> {
  const candidatos = await retratosCandidatos(personajeId);
  if (candidatos.length === 0) return [];
  const yaReferencia = new Set(
    (
      await db()
        .select({ mediaId: characterReferences.mediaId })
        .from(characterReferences)
        .where(eq(characterReferences.characterId, personajeId))
    ).map((f) => f.mediaId),
  );
  const filas = await db()
    .select()
    .from(media)
    .where(
      and(
        inArray(
          media.id,
          candidatos.map((c) => c.medioId),
        ),
        isNull(media.deletedAt),
      ),
    );
  return filas.filter((fila) => !yaReferencia.has(fila.id)).map((fila) => aDto(fila, actor));
}
