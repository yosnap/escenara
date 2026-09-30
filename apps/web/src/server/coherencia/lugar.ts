import { eq } from "drizzle-orm";
import { db } from "../db/cliente";
import { characters, type FilaEscena, type FilaProyecto, generationJobs } from "../db/esquema";
import { placeVersions } from "../db/esquema-lugares";
import { lugarDeLaEscena } from "../lugares/para-generar";
import { miembrosDelReparto } from "../reparto/consulta";
import { decidirCoherencia } from "./decidir";
import { imagenDe } from "./imagen";
import { percibir, quedaCupoDePercepcion, SIN_CUPO_DE_PERCEPCION } from "./percepcion";

/**
 * **`lugar_fiel`, en sombra**: si el sitio del fotograma aprobado es el de la maestra **de la versión con la que se
 * generó** (no la de ahora: si el lugar cambió después, se compara con lo que se envió).
 *
 * Dos límites, los de la 0.39.0:
 *
 * - **no se evalúa una escena en la que sale una persona real**: mirar el fotograma obligaría a enviar su cara a un
 *   servicio de percepción. Se comprueba el plano del lugar solo y las escenas cuyo reparto es inventado;
 * - la evidencia **no lleva nombres ni datos de nadie**: la percepción del lugar tiene prohibido describir personas,
 *   y lo que se le da a Jev es solo la descripción de los dos sitios.
 *
 * Devuelve el motivo por el que no se ha comprobado, o cadena vacía si se ha decidido.
 */
export async function comprobarLugar(
  usuarioId: string,
  escena: FilaEscena,
  proyecto: FilaProyecto,
  sujeto: { tipo: "escena"; id: string; proyectoId: string },
): Promise<string> {
  const pedido = lugarDeLaEscena(escena, proyecto.defaultPlaceId);
  if (!pedido.lugarId) return "Esta escena no tiene lugar, así que no hay sitio que comparar.";
  if (!escena.approvedFrameMediaId) return "Esta escena todavía no tiene fotograma aprobado en el que mirar el lugar.";
  if (!pedido.soloLugar && (await saleUnaPersonaReal(escena, proyecto))) {
    return "En esta escena sale una persona real: para mirar el lugar habría que enviar su fotograma a un servicio de terceros, y eso no se hace. Se comprueba en los planos del lugar solo y con personajes inventados.";
  }
  const maestraId = await maestraUsada(escena, pedido.lugarId);
  if (!maestraId) return "El lugar no tiene foto maestra con la que comparar, o ya no está en la biblioteca.";
  if (!(await quedaCupoDePercepcion(usuarioId))) return SIN_CUPO_DE_PERCEPCION;
  const [referencia, resultado] = await Promise.all([imagenDe(maestraId), imagenDe(escena.approvedFrameMediaId)]);
  if (!referencia || !resultado) return "No se ha podido leer la foto maestra o el fotograma de esta escena.";
  const [hechosMaestra, hechosFotograma] = await Promise.all([
    percibir({
      usuarioId,
      proyectoId: proyecto.id,
      clase: "lugar",
      claveIdempotencia: `coherencia:lugar:${escena.id}:maestra:${maestraId}`,
      imagen: referencia,
    }),
    percibir({
      usuarioId,
      proyectoId: proyecto.id,
      clase: "lugar",
      claveIdempotencia: `coherencia:lugar:${escena.id}:fotograma:${escena.approvedFrameMediaId}`,
      imagen: resultado,
    }),
  ]);
  const decision = await decidirCoherencia({
    usuarioId,
    comprobacion: "lugar_fiel",
    sujeto,
    percepcion: hechosFotograma,
    referencia: { place_reference: hechosMaestra.hechos },
  });
  return decision.motivo;
}

/** La maestra de la versión con la que se generó el fotograma aprobado; la vigente si no se sabe. */
async function maestraUsada(escena: FilaEscena, lugarId: string): Promise<string | null> {
  const [trabajo] = escena.approvedFrameJobId
    ? await db()
        .select({ version: generationJobs.placeVersion, lugar: generationJobs.placeId })
        .from(generationJobs)
        .where(eq(generationJobs.id, escena.approvedFrameJobId))
        .limit(1)
    : [];
  const version = trabajo?.lugar === lugarId ? trabajo.version : null;
  const filas = await db()
    .select({ numero: placeVersions.number, maestra: placeVersions.masterMediaId })
    .from(placeVersions)
    .where(eq(placeVersions.placeId, lugarId));
  const elegida =
    (version !== null ? filas.find((f) => f.numero === version) : undefined) ??
    filas.reduce<(typeof filas)[number] | undefined>((max, f) => (!max || f.numero > max.numero ? f : max), undefined);
  return elegida?.maestra ?? null;
}

/**
 * Si en el fotograma sale alguien real: cualquiera del reparto, o el protagonista del proyecto (que es con quien se
 * genera el fotograma de una escena). Una escena sin reparto guardado y sin protagonista no lleva a nadie.
 */
async function saleUnaPersonaReal(escena: FilaEscena, proyecto: FilaProyecto): Promise<boolean> {
  const reparto = await miembrosDelReparto(escena.id);
  if (reparto.some((m) => !m.inventado)) return true;
  if (!proyecto.mainCharacterId) return false;
  const [protagonista] = await db()
    .select({ virtual: characters.virtual })
    .from(characters)
    .where(eq(characters.id, proyecto.mainCharacterId))
    .limit(1);
  // Sin fila no se sabe quién es: se trata como persona real, que es el lado que no envía nada.
  return protagonista?.virtual !== true;
}
