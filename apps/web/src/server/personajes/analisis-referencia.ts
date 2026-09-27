import { and, eq, isNotNull, isNull } from "drizzle-orm";
import {
  esCasiIgual,
  esMotivoRechazo,
  esMotivoTecnico,
  esVista,
  evaluarCalidad,
  type MetricasCalidad,
  type MotivoRechazo,
  type RechazoDeReferencia,
  type Vista,
} from "@/lib/captura-personaje";
import { leerAjustes } from "../ajustes";
import { leerObjeto } from "../almacenamiento";
import { db, type Ejecutor } from "../db/cliente";
import { characterReferences, type FilaMedio, media } from "../db/esquema";
import { analizarImagen, umbralesDe } from "./calidad";
import { ErrorPersonaje, ErrorReferenciaRechazada } from "./errores";

/**
 * Control de calidad y detección de duplicados de las fotos que se añaden como referencia (RF03). Es la
 * puerta que decide **el servidor**: el navegador avisa antes de subir, pero lo que se guarda o no se decide
 * aquí, con los umbrales de Admin › Ajustes.
 *
 * Dos reglas:
 *
 * - un **mínimo técnico** (resolución, imagen inmensa) o un **duplicado** no se guardan de ninguna manera: no
 *   hay «usar de todas formas», porque la foto no aporta nada como referencia;
 * - lo demás (borrosa, poca luz, demasiada luz, cara pequeña) se puede añadir de todas formas, y entonces la
 *   referencia guarda **todos** los motivos para que la ficha los siga diciendo.
 */

/** Lo que pide el navegador para cada foto que quiere añadir. */
export interface PeticionReferencia {
  medioId: string;
  /** Vista del catálogo que cubre esta foto; vacío o ausente = sin clasificar. */
  vistaClave?: unknown;
  /** Proporción de la cara medida en el navegador (0–1); no la puede medir el servidor. */
  caraRelativa?: unknown;
  /** El usuario ha aceptado añadirla aunque el control de calidad la haya marcado. */
  usarDeTodasFormas?: unknown;
}

/** Lo que hay que guardar de una foto aceptada. */
export interface ReferenciaAnalizada {
  medioId: string;
  vistaClave: Vista | null;
  metricas: MetricasCalidad;
  huella: string | null;
  /** Motivos con los que se marcó, si se añadió «de todas formas»; vacío si pasó limpia. */
  motivosMarcada: MotivoRechazo[];
}

export interface ResultadoAnalisis {
  aceptadas: ReferenciaAnalizada[];
  rechazadas: RechazoDeReferencia[];
}

function vistaValida(valor: unknown): Vista | null {
  if (valor === undefined || valor === null || valor === "") return null;
  if (!esVista(valor)) throw new ErrorPersonaje(400, "Esa vista no existe.");
  return valor;
}

/** La proporción de cara la mide el navegador, así que se acota como cualquier otro dato que llega de fuera. */
function caraValida(valor: unknown): number | null {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0 || valor > 1) {
    throw new ErrorPersonaje(400, "La medida de la cara no es válida.");
  }
  return Math.round(valor * 10_000) / 10_000;
}

/**
 * Huellas de las referencias que ya tiene el personaje (sin las que estén en la papelera). Acepta un ejecutor
 * porque la comprobación definitiva se hace **dentro de la transacción**, con la fila del usuario ya
 * bloqueada: leerlas antes solo sirve para dar el veredicto, y entre esa lectura y el `INSERT` cabe otra
 * petición del mismo usuario.
 */
export async function huellasDelPersonaje(personajeId: string, ejecutor: Ejecutor = db()): Promise<string[]> {
  const filas = await ejecutor
    .select({ huella: characterReferences.phash })
    .from(characterReferences)
    .innerJoin(media, eq(media.id, characterReferences.mediaId))
    .where(
      and(
        eq(characterReferences.characterId, personajeId),
        isNull(media.deletedAt),
        isNotNull(characterReferences.phash),
      ),
    );
  return filas.flatMap((f) => (f.huella ? [f.huella] : []));
}

/**
 * Analiza las fotos que se quieren añadir: mide cada una, la compara con lo que ya tiene el personaje y con
 * las de esta misma tanda, y decide qué se guarda.
 *
 * Los bytes se leen del almacenamiento propio, se miden en memoria y se descartan: no se copian, no se envían
 * a ningún sitio y no se escribe nada de la foto en el registro del servidor.
 */
export async function analizarReferencias(
  personajeId: string,
  peticiones: PeticionReferencia[],
  medios: Map<string, FilaMedio>,
): Promise<ResultadoAnalisis> {
  const umbrales = umbralesDe(await leerAjustes());
  const previas = await huellasDelPersonaje(personajeId);
  const aceptadas: ReferenciaAnalizada[] = [];
  const rechazadas: RechazoDeReferencia[] = [];

  for (const peticion of peticiones) {
    const vistaClave = vistaValida(peticion.vistaClave);
    const caraRelativa = caraValida(peticion.caraRelativa);
    const fila = medios.get(peticion.medioId);
    if (!fila) throw new ErrorPersonaje(404, "Alguna de las fotos no existe.");

    const datos = new Uint8Array(await leerObjeto(fila.storageKey).arrayBuffer());
    const analisis = await analizarImagen(datos);
    const metricas: MetricasCalidad = { ...analisis.metricas, caraRelativa };

    // Una imagen con un lienzo inmenso no se ha decodificado, así que no hay más medidas que dar: se rechaza
    // con su motivo propio en lugar de decir «foto pequeña», que sería justo lo contrario de lo que pasa.
    if (analisis.demasiadoGrande) {
      rechazadas.push({ medioId: peticion.medioId, motivos: ["enorme"], bloqueante: true, metricas });
      continue;
    }

    // El duplicado se comprueba contra lo que ya tiene el personaje **y** contra las de esta misma tanda:
    // subir dos veces la misma foto en una sola petición es el caso más fácil de provocar.
    const duplicada =
      analisis.huella !== null &&
      [...previas, ...aceptadas.flatMap((a) => (a.huella ? [a.huella] : []))].some((h) =>
        esCasiIgual(h, analisis.huella as string),
      );

    const veredicto = evaluarCalidad(metricas, umbrales);
    const motivos: MotivoRechazo[] = duplicada ? ["duplicada", ...veredicto.motivos] : veredicto.motivos;
    const bloqueante = motivos.some(esMotivoTecnico);

    if (motivos.length > 0 && (bloqueante || peticion.usarDeTodasFormas !== true)) {
      rechazadas.push({ medioId: peticion.medioId, motivos, bloqueante, metricas });
      continue;
    }
    aceptadas.push({
      medioId: peticion.medioId,
      vistaClave,
      metricas,
      huella: analisis.huella,
      motivosMarcada: motivos,
    });
  }
  return { aceptadas, rechazadas };
}

/**
 * Última comprobación de duplicados, ya **dentro de la transacción** y con la fila del usuario bloqueada: dos
 * peticiones a la vez del mismo usuario midieron las dos contra el mismo estado anterior, y sin esto las dos
 * guardarían la misma foto. Lo que caiga aquí se mueve a rechazado con el mismo motivo que habría dado antes.
 */
export async function descartarDuplicadosTardios(
  personajeId: string,
  resultado: ResultadoAnalisis,
  ejecutor: Ejecutor,
): Promise<ResultadoAnalisis> {
  if (resultado.aceptadas.length === 0) return resultado;
  const previas = await huellasDelPersonaje(personajeId, ejecutor);
  if (previas.length === 0) return resultado;
  const aceptadas: ReferenciaAnalizada[] = [];
  const rechazadas = [...resultado.rechazadas];
  for (const candidata of resultado.aceptadas) {
    if (candidata.huella !== null && previas.some((h) => esCasiIgual(h, candidata.huella as string))) {
      rechazadas.push({
        medioId: candidata.medioId,
        motivos: ["duplicada"],
        bloqueante: true,
        metricas: candidata.metricas,
      });
      continue;
    }
    aceptadas.push(candidata);
  }
  return { aceptadas, rechazadas };
}

/**
 * Nada que guardar y algo rechazado: se responde con el detalle de cada foto en lugar de un 200 silencioso
 * que dejaría al usuario mirando un personaje sin la foto que acaba de añadir.
 */
export function exigirAlgoQueGuardar(resultado: ResultadoAnalisis): void {
  if (resultado.aceptadas.length > 0 || resultado.rechazadas.length === 0) return;
  throw new ErrorReferenciaRechazada(resultado.rechazadas);
}

/**
 * Motivos guardados en la fila, separados por comas y validados contra la enumeración antes de escribirlos.
 * `null` cuando la foto pasó limpia.
 */
export const motivosGuardables = (motivos: MotivoRechazo[]): string | null => {
  const validos = motivos.filter(esMotivoRechazo);
  return validos.length > 0 ? validos.join(",") : null;
};

/** Motivos tal como se leen de la fila: lo que no esté en la enumeración se descarta. */
export const motivosGuardados = (valor: string | null): MotivoRechazo[] =>
  (valor ?? "")
    .split(",")
    .map((m) => m.trim())
    .filter(esMotivoRechazo);
