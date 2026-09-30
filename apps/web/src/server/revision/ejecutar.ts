import { eq } from "drizzle-orm";
import { REGLAS_VERSION } from "@/lib/controles";
import { proporcionFijadaDelProyecto } from "@/lib/formatos";
import { PROPORCION_DISPONIBLE } from "@/lib/produccion";
import {
  type ComprobacionRevision,
  peorSeveridad,
  type SeveridadRevision,
  type VeredictoRevision,
} from "@/lib/revision";
import { leerAjustes } from "../ajustes";
import { escenaPropia } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import { type FilaEscena, type FilaMedio, media } from "../db/esquema";
import type { Actor } from "../media/servicio";
import { conClipEnDisco } from "./archivo";
import { comprobacionesDeArchivo, pedidoDeEscena, type UmbralesRevision } from "./automatica";
import { ErrorMedida, exigirHerramientasDeMedida } from "./medicion";
import { guardarRevision } from "./resultados";

/**
 * Ejecuta la **comprobación automática** del clip de una escena (RF07). No cuesta un solo crédito: se mide el
 * archivo que ya está en la biblioteca con ffprobe y ffmpeg.
 *
 * Quien revisa es **el dueño del proyecto** (decisión provisional del propietario, 2026-09-27): `escenaPropia`
 * responde 404 para una escena ajena, igual que en 0.17.0–0.19.0, así que quien administra no revisa contenido de
 * otra persona ni siquiera con el identificador en la mano.
 *
 * El veredicto de esta revisión **nunca es «acepta»**: mide el archivo, no la identidad. Cuando todo pasa queda
 * `pendiente`, porque lo que falta es que una persona mire el clip junto a la hoja de personaje.
 */

/**
 * Traduce un fallo al tomar la medida en un 503 con **su** motivo. Un `ErrorMedida` ya trae un mensaje escrito para
 * quien lo lee; cualquier otra cosa se resume sin filtrar detalles internos.
 */
function comoErrorDeRevision(error: unknown): never {
  if (error instanceof ErrorMedida) throw new ErrorProyecto(503, error.message);
  console.error("[revisión] no se ha podido medir el clip:", error);
  throw new ErrorProyecto(503, "No se ha podido comprobar el clip en este servidor. Vuelve a intentarlo.");
}

/** Umbrales de la comprobación tal como los fija Admin › Ajustes. */
export async function umbralesDeRevision(): Promise<UmbralesRevision> {
  const ajustes = await leerAjustes();
  return {
    toleranciaDuracion: ajustes.revisionToleranciaDuracion,
    segundosPlanosMaximos: ajustes.revisionSegundosPlanosMaximos,
    exigirAudio: ajustes.revisionExigirAudio,
  };
}

/**
 * Proporción con la que hay que comparar el clip de la escena: la del **formato principal del proyecto** (9:16 en
 * los de siempre), que es la que el montaje espera. No se usa la que se pidió al generar: un clip de «Crear» pedido
 * en 16:9 y convertido en escena de un proyecto vertical tiene que salir como proporción distinta, no darse por bueno.
 */
const proporcionEsperada = (formatosDelProyecto: unknown): string =>
  proporcionFijadaDelProyecto(formatosDelProyecto) ?? PROPORCION_DISPONIBLE;

/** El clip de la escena, o el motivo por el que todavía no hay nada que comprobar. */
export async function clipDeEscena(escena: FilaEscena): Promise<FilaMedio> {
  if (escena.clipMediaId === null) {
    throw new ErrorProyecto(
      409,
      "Esta escena todavía no tiene clip, así que no hay nada que revisar. Prodúcela y aprueba su fotograma para que se anime.",
    );
  }
  const [fila] = await db().select().from(media).where(eq(media.id, escena.clipMediaId)).limit(1);
  if (!fila || fila.deletedAt !== null) {
    throw new ErrorProyecto(
      409,
      "El clip de esta escena no está en tu biblioteca (se ha borrado o está en la papelera). Restáuralo o regenera la escena.",
    );
  }
  return fila;
}

/** Severidad y veredicto de un conjunto de comprobaciones. La automática nunca acepta: no valida la identidad. */
export function resultadoAutomatico(comprobaciones: readonly ComprobacionRevision[]): {
  severidad: SeveridadRevision;
  veredicto: VeredictoRevision;
} {
  const severidad = peorSeveridad(comprobaciones.map((c) => c.severidad));
  return { severidad, veredicto: severidad === "critica" ? "rechaza" : "pendiente" };
}

/** Resumen en lenguaje llano de lo que ha salido, para que la fila diga algo sin abrirla. */
export function notasAutomaticas(comprobaciones: readonly ComprobacionRevision[]): string {
  const fallos = comprobaciones.filter((c) => c.resultado === "falla");
  const sinMedir = comprobaciones.filter((c) => c.resultado === "no_medible");
  if (fallos.length === 0 && sinMedir.length === 0) {
    return "Todo lo que se puede medir del archivo está en orden. Que el personaje siga siendo el mismo lo decides tú.";
  }
  const partes: string[] = [];
  if (fallos.length > 0)
    partes.push(fallos.length === 1 ? "Falla una comprobación." : `Fallan ${fallos.length} comprobaciones.`);
  if (sinMedir.length > 0) {
    partes.push(
      sinMedir.length === 1
        ? "Una comprobación no se ha podido medir, así que no está aprobada: míralo tú."
        : `${sinMedir.length} comprobaciones no se han podido medir, así que no están aprobadas: míralo tú.`,
    );
  }
  return partes.join(" ");
}

/**
 * Comprueba el clip de una escena y deja su resultado apuntado. Devuelve las comprobaciones tal como se
 * guardaron, para que quien llama pueda responder sin volver a leer.
 */
export async function revisarAutomaticamente(actor: Actor, escenaId: unknown): Promise<ComprobacionRevision[]> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  const clip = await clipDeEscena(escena);
  const proporcion = proporcionEsperada(proyecto.formats);
  // Si faltan los binarios se dice **antes** de guardar nada: un panel con vistos verdes por no tener ffprobe
  // sería la peor de las mentiras posibles.
  await exigirHerramientasDeMedida().catch(comoErrorDeRevision);
  const umbrales = await umbralesDeRevision();
  /**
   * Todo lo que impide **tomar la medida** (no está el archivo, pesa más de lo que este servidor baja, falta FFmpeg)
   * es un 503 con su motivo, no un «error interno»: son cosas del entorno con una acción concreta para quien las ve,
   * y esconderlas detrás de un 500 dejaría al usuario sin saber qué hacer.
   */
  const comprobaciones = await conClipEnDisco(clip.storageKey, clip.mimeType, (ruta) =>
    comprobacionesDeArchivo(ruta, pedidoDeEscena(escena.plannedSeconds, proporcion), umbrales),
  ).catch(comoErrorDeRevision);
  const { severidad, veredicto } = resultadoAutomatico(comprobaciones);
  /**
   * Medir tarda (ffmpeg decodifica el clip entero), así que la escena puede haberse regenerado mientras se medía:
   * `guardarRevision` bloquea su fila y comprueba que el clip siga siendo el que se midió antes de guardar nada.
   * Y como esta es una automática, invalida en la misma transacción la automática anterior: manda la más reciente,
   * así que el bloqueo y la insignia salen siempre del mismo dato.
   */
  await guardarRevision({
    escenaId: escena.id,
    trabajoId: escena.clipJobId,
    clipMedioId: clip.id,
    tipo: "automatica",
    severidad,
    veredicto,
    comprobaciones,
    revisorId: null,
    notas: notasAutomaticas(comprobaciones),
    creditos: null,
    reglasVersion: REGLAS_VERSION,
  });
  return comprobaciones;
}
