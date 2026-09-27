import { eq, inArray } from "drizzle-orm";
import { ETIQUETA_VISTA } from "@/lib/captura-personaje";
import { mejoresReferencias } from "@/lib/ficha-personaje";
import type { Medio } from "@/lib/media/tipos";
import { leerObjeto } from "../almacenamiento";
import { db } from "../db/cliente";
import { characterVersions, type FilaMedio, media } from "../db/esquema";
import { type CeldaHoja, montarHojaDeContacto } from "../media/procesado";
import { type Actor, crearMedio, eliminarDefinitivamente, enviarAPapelera } from "../media/servicio";
import { filaPropia } from "./consulta";
import { referenciasElegibles } from "./contexto";
import { ErrorPersonaje } from "./errores";
import { asegurarVersionVigente } from "./versiones";

/**
 * Hoja de personaje (decisión 2 de la fase 15): montaje de sus referencias **compuesto en el servidor, sin
 * IA y sin coste**. Regenerarla es gratis, y por eso no hay confirmación de gasto en ninguna parte.
 *
 * Reglas duras:
 *
 * - **una hoja por versión**: al regenerarla dentro de la misma versión, la anterior se borra (fila y objeto)
 *   en lugar de acumularse en la cuota de nadie;
 * - se guarda en la **biblioteca del usuario**, así que pasa por su cuota y por su papelera como cualquier
 *   otro medio suyo;
 * - **solo el dueño** la compone y la ve: es un montaje con las fotos de una persona. Quien administra ve el
 *   historial de versiones, no la hoja.
 */

/** Como mucho nueve fotos: una cuadrícula de tres por tres se lee de un vistazo. */
const MAXIMO_CELDAS = 9;

/** Rótulo de una referencia en la hoja: su vista y, si es generada, que lo es. */
const rotulo = (vista: string | null, generada: boolean): string => {
  const base = vista ? ETIQUETA_VISTA[vista as keyof typeof ETIQUETA_VISTA] : "Sin clasificar";
  return generada ? `${base} (generada)` : base;
};

/**
 * Compone (o recompone) la hoja de personaje de la versión vigente y la deja guardada en ella. Devuelve el
 * medio resultante tal como lo ve el navegador.
 */
export async function componerHojaDePersonaje(
  actor: Actor,
  id: unknown,
): Promise<{ hoja: Medio; versionId: string; versionNumero: number }> {
  const personaje = await filaPropia(actor, id);
  const elegibles = await referenciasElegibles(personaje.id);
  if (elegibles.length === 0) {
    throw new ErrorPersonaje(
      409,
      "Este personaje no tiene ninguna foto utilizable, así que no hay nada con lo que componer la hoja. Añade fotos de referencia y vuelve a intentarlo.",
    );
  }
  const version = await asegurarVersionVigente(personaje);
  const ids = mejoresReferencias(personaje.kind, elegibles, MAXIMO_CELDAS);
  const porId = new Map(elegibles.map((r) => [r.mediaId, r]));
  const filas = await db().select().from(media).where(inArray(media.id, ids));
  const archivos = new Map(filas.map((f: FilaMedio) => [f.id, f]));

  const celdas: CeldaHoja[] = [];
  for (const medioId of ids) {
    const fila = archivos.get(medioId);
    if (!fila) continue;
    try {
      celdas.push({
        datos: new Uint8Array(await leerObjeto(fila.storageKey).arrayBuffer()),
        etiqueta: rotulo(porId.get(medioId)?.vistaClave ?? null, porId.get(medioId)?.origen === "vista_generada"),
      });
    } catch (error) {
      // Una foto que no se puede leer no impide la hoja: se deja fuera y se registra sin su nombre.
      console.error(
        `[personajes] foto ilegible al componer la hoja del personaje ${personaje.id}: ${(error as Error).name}`,
      );
    }
  }
  if (celdas.length === 0) {
    throw new ErrorPersonaje(409, "No se ha podido leer ninguna de las fotos del personaje. Vuelve a intentarlo.");
  }

  const montaje = await montarHojaDeContacto(personaje.name, celdas);
  const archivo = new File([montaje.datos as Uint8Array<ArrayBuffer>], `hoja-${personaje.name}.webp`, {
    type: montaje.mime,
  });
  // Nace **marcada** como hoja de este personaje: así se oculta a quien administra desde el primer instante y
  // el borrado del personaje la encuentra aunque la versión deje de apuntarla.
  const hoja = await crearMedio(actor, archivo, {}, ["imagen"], null, { hojaDePersonaje: personaje.id });

  /**
   * El intercambio va en una transacción con la **fila de la versión bloqueada**, y lo que se borra es lo que
   * devuelve esa lectura. Sin el bloqueo, dos composiciones a la vez leerían las dos la misma hoja anterior:
   * una de las dos se quedaría apuntada sin que nadie la borrara (fuga de cuota) o las dos borrarían la misma y
   * la versión acabaría apuntando a un medio ya inexistente.
   */
  const anterior = await db().transaction(async (tx) => {
    const [bloqueada] = await tx
      .select({ hoja: characterVersions.sheetMediaId })
      .from(characterVersions)
      .where(eq(characterVersions.id, version.id))
      .for("update");
    await tx.update(characterVersions).set({ sheetMediaId: hoja.id }).where(eq(characterVersions.id, version.id));
    return bloqueada?.hoja ?? null;
  });
  if (anterior && anterior !== hoja.id) await borrarHojaAnterior(actor, anterior);
  return { hoja, versionId: version.id, versionNumero: version.number };
}

/**
 * Borra la hoja que acaba de sustituirse. Nunca lanza hacia fuera: la hoja nueva ya está guardada y perderla
 * por no poder borrar la vieja sería peor. Un medio que el usuario haya borrado ya no existe y no es un error.
 */
async function borrarHojaAnterior(actor: Actor, medioId: string): Promise<void> {
  try {
    // El borrado definitivo solo funciona desde la papelera, así que primero se envía allí.
    await enviarAPapelera(actor, medioId);
    // `confirmado = true` a propósito: el aviso de «medio en uso» existe para que nadie borre sin querer una
    // foto de referencia, y esto no es una foto del usuario. Es la hoja que él mismo acaba de sustituir, ya
    // reemplazada en la versión, y la única forma de que no se le coma la cuota es borrarla sin preguntar.
    await eliminarDefinitivamente(actor, medioId, true);
  } catch (error) {
    console.error(`[personajes] hoja de personaje anterior sin borrar (${medioId}): ${(error as Error).name}`);
  }
}
