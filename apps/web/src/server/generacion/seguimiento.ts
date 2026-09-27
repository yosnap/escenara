import { and, eq, isNull } from "drizzle-orm";
import { CLIP, LARGO_ESTADO_PROVEEDOR, TIPO_RESULTADO, type TrabajoVista } from "@/lib/generacion";
import { usarCredencial } from "../boveda/credenciales";
import { db } from "../db/cliente";
import { type FilaTrabajo, generationJobs } from "../db/esquema";
import { type Actor, crearMedio, eliminarDefinitivamente, enviarAPapelera, limiteSubida } from "../media/servicio";
import { consultarTarea, ErrorKie, type TareaKie } from "../proveedores/kie/cliente";
import { ErrorGeneracion } from "./errores";
import { HERRAMIENTAS, type Herramientas } from "./herramientas";
import { filaPropia, MS_MAXIMO_PREPARANDO, vistaDeFila } from "./trabajos";

/**
 * Seguimiento de los trabajos por sondeo (ADR-0014): el navegador pregunta por el estado y el servidor
 * consulta al proveedor con un mínimo entre consultas por trabajo. Nunca se reenvía nada: solo se consulta
 * el `task_id` guardado.
 *
 * Idempotencia por tarea: dos consultas simultáneas del mismo trabajo comparten la misma operación, y la
 * fila solo se cierra si todavía no tenía medio resultante, así que no se descarga ni se guarda dos veces.
 * Con la cola persistente de 0.12.0 esto pasará a un worker y el reparto dejará de ser por proceso.
 */

/** Mínimo entre consultas al proveedor por trabajo (el navegador pregunta más a menudo que esto). */
export const MS_MINIMO_ENTRE_CONSULTAS = 3500;

/**
 * Suelo para las consultas que pide el usuario: «Volver a consultar» adelanta el sondeo, pero no puede
 * convertirse en una herramienta para golpear al proveedor pulsando el botón.
 */
export const MS_SUELO_ENTRE_CONSULTAS = 1000;

const MENSAJE_SIN_RESPUESTA =
  "El proveedor no ha contestado a la consulta. El trabajo no se reenviará: vuelve a consultarlo cuando quieras con su identificador de tarea.";

/** Consultas en marcha por tarea, para no duplicar la descarga del resultado. */
const enMarcha = new Map<string, Promise<TrabajoVista>>();

export interface OpcionesConsulta {
  /**
   * `true` cuando lo pide el usuario («Volver a consultar»): baja el mínimo entre consultas al suelo y
   * permite avanzar un trabajo «sin respuesta» o «listo sin guardar». Antes del suelo se devuelve el
   * estado guardado, sin llamar al proveedor.
   */
  forzar?: boolean;
}

/**
 * Estado actual del trabajo, consultando al proveedor si toca. Un trabajo ajeno responde 404 (ni se
 * consulta ni se reconcilia).
 */
export async function consultarTrabajo(
  actor: Actor,
  id: string,
  opciones: OpcionesConsulta = {},
  h: Herramientas = HERRAMIENTAS,
): Promise<TrabajoVista> {
  const fila = await filaPropia(actor.id, id);

  // Terminado de verdad: nada que preguntar.
  if (fila.state === "fallido" || (fila.state === "listo" && fila.resultMediaId !== null)) return vistaDeFila(fila);

  if (!fila.taskId) {
    if (fila.state === "preparando" && Date.now() - fila.createdAt.getTime() > MS_MAXIMO_PREPARANDO) {
      return guardarEstado(fila.id, { state: "desconocido", errorMessage: MENSAJE_SIN_RESPUESTA });
    }
    return vistaDeFila(fila);
  }

  // `desconocido` y «listo sin guardar» solo avanzan si el usuario lo pide: no se insiste en automático.
  if (!opciones.forzar && (fila.state === "desconocido" || fila.state === "listo")) return vistaDeFila(fila);
  const minimo = opciones.forzar ? MS_SUELO_ENTRE_CONSULTAS : MS_MINIMO_ENTRE_CONSULTAS;
  if (fila.polledAt !== null && Date.now() - fila.polledAt.getTime() < minimo) return vistaDeFila(fila);

  const clave = await usarCredencial(actor.id, "kie");
  if (!clave) {
    throw new ErrorGeneracion(409, "No hay una clave de KIE utilizable en tu cuenta. Añádela en «Tu cuenta».");
  }

  const llave = `${fila.provider}:${fila.taskId}`;
  const compartida = enMarcha.get(llave);
  if (compartida) return compartida;
  const promesa = consultar(actor, fila, clave, h).finally(() => enMarcha.delete(llave));
  enMarcha.set(llave, promesa);
  return promesa;
}

/** Vuelve a consultar aunque el trabajo esté `desconocido`: es lo que hace «Volver a consultar». */
export function reconciliar(actor: Actor, id: string, h: Herramientas = HERRAMIENTAS): Promise<TrabajoVista> {
  return consultarTrabajo(actor, id, { forzar: true }, h);
}

async function consultar(actor: Actor, fila: FilaTrabajo, clave: string, h: Herramientas): Promise<TrabajoVista> {
  const taskId = fila.taskId as string;
  await db().update(generationJobs).set({ polledAt: new Date() }).where(eq(generationJobs.id, fila.id));

  let tarea: TareaKie;
  try {
    tarea = await consultarTarea(clave, taskId, h.buscar);
  } catch (error) {
    if (!(error instanceof ErrorKie)) throw error;
    if (error.codigo === "tiempo-agotado" || error.codigo === "sin-red") {
      // Tras un timeout no se reenvía: el trabajo queda desconocido y decide el usuario.
      return guardarEstado(fila.id, { state: "desconocido", errorMessage: MENSAJE_SIN_RESPUESTA });
    }
    // Un fallo de la consulta (clave rechazada, exceso de peticiones) no cambia el estado del trabajo.
    throw new ErrorGeneracion(502, `No se ha podido consultar el estado. ${error.message}`);
  }

  if (tarea.estadoPropio === "listo") return guardarResultado(actor, fila, tarea, h);

  if (tarea.estadoPropio === "fallido") {
    return guardarEstado(fila.id, {
      state: "fallido",
      providerState: tarea.estado,
      consumedCredits: tarea.creditos,
      // El texto del proveedor no se propaga: puede contener datos de la petición.
      errorMessage: "El proveedor no ha podido completar la generación. No se ha vuelto a enviar nada.",
      finishedAt: new Date(),
    });
  }

  if (tarea.estadoPropio === "desconocido") {
    return guardarEstado(fila.id, {
      state: "desconocido",
      providerState: tarea.estado,
      errorMessage: `El proveedor informa de un estado que no conocemos («${tarea.estado}»). No se reenviará nada.`,
    });
  }

  return guardarEstado(fila.id, { state: tarea.estadoPropio, providerState: tarea.estado });
}

/**
 * Descarga el resultado en cuanto se sabe que está listo (la URL de KIE caduca) y lo guarda en la
 * biblioteca del usuario respetando su cuota. Si el guardado falla, el trabajo queda `listo` con el error:
 * ya se ha pagado, y volver a consultar reintenta la descarga, nunca la generación.
 */
async function guardarResultado(
  actor: Actor,
  fila: FilaTrabajo,
  tarea: TareaKie,
  h: Herramientas,
): Promise<TrabajoVista> {
  const url = tarea.urls[0];
  if (!url) {
    return guardarEstado(fila.id, {
      state: "listo",
      providerState: tarea.estado,
      consumedCredits: tarea.creditos,
      errorMessage: "El proveedor dice que está listo pero no ha devuelto ningún archivo.",
    });
  }
  const permitidos = TIPO_RESULTADO[fila.kind];
  try {
    const { archivo, origen } = await h.descargar(url, limiteSubida(permitidos));
    const reproduccion = fila.kind === "animacion" ? { duracion: CLIP.segundos } : {};
    const medio = await crearMedio(actor, archivo, reproduccion, permitidos, origen);
    const [cerrada] = await db()
      .update(generationJobs)
      .set({
        state: "listo",
        providerState: tarea.estado,
        consumedCredits: tarea.creditos,
        resultMediaId: medio.id,
        errorMessage: null,
        finishedAt: new Date(),
      })
      .where(and(eq(generationJobs.id, fila.id), isNull(generationJobs.resultMediaId)))
      .returning();
    if (cerrada) return vistaDeFila(cerrada);
    // Otra consulta lo cerró antes: el archivo repetido se borra de verdad (la papelera seguiría ocupando
    // cuota del usuario por algo que no ha pedido).
    await enviarAPapelera(actor, medio.id)
      .then(() => eliminarDefinitivamente(actor, medio.id))
      .catch((error) => console.error(`[generacion] resultado duplicado sin borrar (${medio.id}):`, error));
    return vistaDeFila(await filaPropia(actor.id, fila.id));
  } catch (error) {
    const detalle = error instanceof Error ? error.message : "Error al guardar el resultado.";
    console.error(`[generacion] no se ha podido guardar el resultado del trabajo ${fila.id}: ${detalle}`);
    return guardarEstado(fila.id, {
      state: "listo",
      providerState: tarea.estado,
      consumedCredits: tarea.creditos,
      errorMessage: `El trabajo se ha generado, pero no se ha podido guardar en tu biblioteca: ${detalle} Vuelve a consultarlo para reintentar la descarga.`,
    });
  }
}

async function guardarEstado(id: string, cambios: Partial<typeof generationJobs.$inferInsert>): Promise<TrabajoVista> {
  // El estado del proveedor es una etiqueta suya, no un texto libre: se guarda recortado.
  const crudo = cambios.providerState;
  const valores =
    typeof crudo === "string" ? { ...cambios, providerState: crudo.slice(0, LARGO_ESTADO_PROVEEDOR) } : cambios;
  const [fila] = await db().update(generationJobs).set(valores).where(eq(generationJobs.id, id)).returning();
  if (!fila) throw new ErrorGeneracion(404, "El trabajo no existe.");
  return vistaDeFila(fila);
}
