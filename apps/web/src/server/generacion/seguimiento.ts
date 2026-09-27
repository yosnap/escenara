import { and, eq, isNull } from "drizzle-orm";
import { PROVEEDORES_PUBLICOS } from "@/lib/boveda";
import { CLIP, LARGO_ESTADO_PROVEEDOR, TIPO_RESULTADO, type TrabajoVista } from "@/lib/generacion";
import { usarCredencial } from "../boveda/credenciales";
import { db } from "../db/cliente";
import { type FilaTrabajo, generationJobs } from "../db/esquema";
import { type Actor, crearMedio, eliminarDefinitivamente, enviarAPapelera, limiteSubida } from "../media/servicio";
import { adjuntarVistaGenerada } from "../personajes/vista-sintetica";
import { cerrarGasto } from "../presupuesto/reserva";
import { registrarFalloDeEscena, registrarResultadoDeEscena } from "../produccion/cierre";
import { duracionDeModelo } from "../proveedores/catalogo";
import { ErrorProveedor, type TareaProveedor } from "../proveedores/contrato";
import { adaptadorDe } from "../proveedores/registro";
import { ErrorGeneracion } from "./errores";
import { HERRAMIENTAS, type Herramientas } from "./herramientas";
import { filaPropia, vistaDeFila } from "./trabajos";

/**
 * Seguimiento de los trabajos por sondeo (ADR-0014): el navegador pregunta por el estado y el servidor
 * consulta al proveedor con un mínimo entre consultas por trabajo. Nunca se reenvía nada: solo se consulta
 * el `task_id` guardado.
 *
 * Idempotencia por tarea: dos consultas simultáneas del mismo trabajo comparten la misma operación, y la
 * fila solo se cierra si todavía no tenía medio resultante, así que no se descarga ni se guarda dos veces.
 * Desde 0.12.0 el que consulta en automático es el worker de la cola, y al cerrar un trabajo se apunta lo
 * consumido y se libera su reserva (`presupuesto/reserva.ts`), también de forma idempotente: un sondeo y un
 * callback del proveedor que lleguen los dos no cobran dos veces.
 */

/** Mínimo entre consultas al proveedor por trabajo (el navegador pregunta más a menudo que esto). */
export const MS_MINIMO_ENTRE_CONSULTAS = 3500;

/**
 * Suelo para las consultas que pide el usuario: «Volver a consultar» adelanta el sondeo, pero no puede
 * convertirse en una herramienta para golpear al proveedor pulsando el botón.
 */
export const MS_SUELO_ENTRE_CONSULTAS = 1000;

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
  if (fila.state === "fallido" || fila.state === "cancelado") return vistaDeFila(fila);
  if (fila.state === "listo" && fila.resultMediaId !== null) return vistaDeFila(fila);
  // Un trabajo que todavía no ha salido de la cola no tiene nada que consultarle al proveedor.
  if (fila.state === "en_cola" || fila.state === "esperando_limite") return vistaDeFila(fila);

  // Un trabajo sin tarea en el proveedor **no se toca desde aquí**. Antes, una consulta del navegador podía
  // dejar en `desconocido` un trabajo que un worker estaba enviando en ese mismo momento (con su toma viva), y
  // eso retenía su reserva sin motivo y confundía el estado real. Quién cierra una preparación abandonada es
  // cosa del worker, que es el único que sabe si alguien la está atendiendo (`cola/toma.ts`).
  if (!fila.taskId) return vistaDeFila(fila);

  // `desconocido` y «listo sin guardar» solo avanzan si el usuario lo pide: no se insiste en automático.
  if (!opciones.forzar && (fila.state === "desconocido" || fila.state === "listo")) return vistaDeFila(fila);
  const minimo = opciones.forzar ? MS_SUELO_ENTRE_CONSULTAS : MS_MINIMO_ENTRE_CONSULTAS;
  if (fila.polledAt !== null && Date.now() - fila.polledAt.getTime() < minimo) return vistaDeFila(fila);

  // La tarea se consulta con la clave del proveedor que la ejecuta, que es el que la cobró.
  const clave = await usarCredencial(actor.id, fila.provider);
  if (!clave) {
    const nombre = PROVEEDORES_PUBLICOS[fila.provider].nombre;
    throw new ErrorGeneracion(409, `No hay una clave de ${nombre} utilizable en tu cuenta. Añádela en «Tu cuenta».`);
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

  let tarea: TareaProveedor;
  try {
    tarea = await adaptadorDe(fila.provider).consultar({ clave, taskId, buscar: h.buscar });
  } catch (error) {
    if (!(error instanceof ErrorProveedor)) throw error;
    /**
     * **Un fallo de la consulta no cambia el estado del trabajo.** Da igual que sea una clave rechazada, un
     * exceso de peticiones, un 5xx o un tiempo agotado: lo único que ha fallado es nuestra pregunta, y la
     * tarea sigue exactamente donde estaba. Antes, un tiempo agotado dejaba el trabajo `desconocido`, así que
     * un corte de red de tres segundos mandaba a revisión (con su reserva retenida) un trabajo que estaba
     * generando de lo más bien, y hacía falta que una persona lo resolviera a mano.
     *
     * Del intento solo queda el `polled_at` que se acaba de escribir, que es lo que espacia las consultas. El
     * **único** camino automático a `desconocido` por falta de respuesta es el techo de edad
     * (`cola/pasada.ts › cerrarPorEdad`), medido desde que el trabajo salió al proveedor.
     */
    throw new ErrorGeneracion(502, `No se ha podido consultar el estado. ${error.message}`);
  }

  if (tarea.estadoPropio === "listo") return guardarResultado(actor, fila, tarea, h);

  if (tarea.estadoPropio === "fallido") {
    // Un fallo del proveedor puede haber cobrado (algunos modelos cobran el intento): se apunta lo que
    // informe, y cero si no informa nada.
    await cerrarGasto(fila.id, tarea.creditos ?? 0, "El proveedor no ha podido completar la generación.");
    /**
     * Si el trabajo producía una escena, se apunta el motivo en ella y **nada más**: no se reenvía, no se
     * reintenta y no se consume ningún reintento de pago (decisión provisional del propietario, 2026-09-27).
     * Volver a intentarlo es una decisión del usuario, con presupuesto de reintentos explícito.
     */
    await registrarFalloDeEscena(
      fila,
      "El proveedor no ha podido completar la generación. No se ha vuelto a enviar nada: si quieres reintentarlo, autoriza un presupuesto de reintentos.",
    );
    return guardarEstado(fila.id, {
      state: "fallido",
      failureReason: "contenido",
      providerState: tarea.estado,
      consumedCredits: tarea.creditos,
      // El texto del proveedor no se propaga: puede contener datos de la petición.
      errorMessage: "El proveedor no ha podido completar la generación. No se ha vuelto a enviar nada.",
      finishedAt: new Date(),
    });
  }

  if (tarea.estadoPropio === "desconocido") {
    // Reserva retenida a propósito: no se sabe si ha costado algo.
    return guardarEstado(fila.id, {
      state: "desconocido",
      failureReason: "respuesta",
      providerState: tarea.estado,
      errorMessage: `El proveedor informa de un estado que no conocemos («${tarea.estado}»). No se reenviará nada.`,
    });
  }

  // Las etapas se apuntan con el estado que informa el proveedor, nunca con un reloj: `enviado` = sigue en su
  // cola, `en_curso` = está generando de verdad.
  return guardarEstado(fila.id, {
    state: tarea.estadoPropio,
    stage: tarea.estadoPropio === "en_curso" ? "en_curso" : "enviado",
    providerState: tarea.estado,
  });
}

/**
 * Descarga el resultado en cuanto se sabe que está listo (la URL del proveedor caduca) y lo guarda en la
 * biblioteca del usuario respetando su cuota. Si el guardado falla, el trabajo queda `listo` con el error:
 * ya se ha pagado, y volver a consultar reintenta la descarga, nunca la generación.
 */
async function guardarResultado(
  actor: Actor,
  fila: FilaTrabajo,
  tarea: TareaProveedor,
  h: Herramientas,
): Promise<TrabajoVista> {
  const url = tarea.urls[0];
  // El trabajo ha terminado: se apunta lo consumido y se libera la reserva, una sola vez por trabajo.
  await cerrarGasto(fila.id, tarea.creditos, "Trabajo terminado en el proveedor.");
  if (!url) {
    return guardarEstado(fila.id, {
      state: "listo",
      providerState: tarea.estado,
      consumedCredits: tarea.creditos,
      errorMessage: "El proveedor dice que está listo pero no ha devuelto ningún archivo.",
    });
  }
  const permitidos = TIPO_RESULTADO[fila.kind];
  // Cuarta etapa: el proveedor ha terminado y estamos trayendo el archivo. Es la única que el estado propio no
  // distingue (el trabajo sigue en `en_curso` hasta que se guarda), y por eso existe la columna.
  await db().update(generationJobs).set({ stage: "descargando" }).where(eq(generationJobs.id, fila.id));
  try {
    const { archivo, origen } = await h.descargar(url, limiteSubida(permitidos));
    // La duración del clip es la que declara el modelo en el catálogo (Hailuo 2.3 hace 6 s, no 4).
    const reproduccion =
      fila.kind === "animacion"
        ? { duracion: (await duracionDeModelo(fila.provider, fila.model)) ?? CLIP.segundos }
        : {};
    const medio = await crearMedio(actor, archivo, reproduccion, permitidos, origen);
    const [cerrada] = await db()
      .update(generationJobs)
      .set({
        state: "listo",
        stage: "listo",
        providerState: tarea.estado,
        consumedCredits: tarea.creditos,
        resultMediaId: medio.id,
        errorMessage: null,
        finishedAt: new Date(),
      })
      .where(and(eq(generationJobs.id, fila.id), isNull(generationJobs.resultMediaId)))
      .returning();
    if (cerrada) {
      // Si el trabajo era una vista sintética del personaje, su resultado entra en la ficha **etiquetado**
      // como vista generada. Solo en la rama que cierra el trabajo, así que no se adjunta dos veces.
      await adjuntarVistaGenerada(cerrada, medio.id);
      // Y si el trabajo producía una escena, la escena apunta lo que acaba de pasar (0.19.0). Un fotograma no
      // se aprueba solo: animar cuesta otro dinero y lo autoriza una persona.
      await registrarResultadoDeEscena(cerrada, medio.id);
      return vistaDeFila(cerrada);
    }
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
