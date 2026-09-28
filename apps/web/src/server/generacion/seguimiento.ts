import { and, eq, isNull } from "drizzle-orm";
import { PROVEEDORES_PUBLICOS } from "@/lib/boveda";
import { mensajeDeFalloDeVoz } from "@/lib/diagnostico-voz";
import { CLIP, LARGO_ESTADO_PROVEEDOR, TIPO_RESULTADO, type TrabajoVista } from "@/lib/generacion";
import { usarCredencial } from "../boveda/credenciales";
import { db } from "../db/cliente";
import { type FilaTrabajo, generationJobs } from "../db/esquema";
import { type Actor, crearMedio, eliminarDefinitivamente, enviarAPapelera, limiteSubida } from "../media/servicio";
import { adjuntarVistaGenerada } from "../personajes/vista-sintetica";
import { cerrarGasto } from "../presupuesto/reserva";
import { guardarMarcasDeVoz, registrarFalloDeEscena, registrarResultadoDeEscena } from "../produccion/cierre";
import { duracionDeModelo } from "../proveedores/catalogo";
import { ErrorProveedor, type TareaProveedor, type VozPedida } from "../proveedores/contrato";
import { adaptadorDe } from "../proveedores/registro";
import { adjuntarMuestraDeVoz } from "../voz/muestra";
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
    return await guardarArchivoDelTrabajo(actor, fila, tarea, archivo, origen);
  } catch (error) {
    // El detalle de la excepción solo al registro: viene del almacenamiento o de la descarga y puede llevar
    // claves de objeto, rutas del servidor o el texto de S3.
    const detalle = error instanceof Error ? error.message : "Error al guardar el resultado.";
    console.error(`[generacion] no se ha podido guardar el resultado del trabajo ${fila.id}: ${detalle}`);
    const nombre = PROVEEDORES_PUBLICOS[fila.provider].nombre;
    return guardarEstado(fila.id, {
      state: "listo",
      providerState: tarea.estado,
      consumedCredits: tarea.creditos,
      errorMessage: `${nombre} (${fila.model}) ha generado el trabajo y sí se ha cobrado, pero no se ha podido guardar en tu biblioteca. El archivo sigue en el proveedor un rato: vuelve a consultarlo para reintentar la descarga, que no cuesta nada. Si sigue fallando, díselo a quien administra esta instalación.`,
    });
  }
}

/**
 * Guarda el archivo del trabajo en la biblioteca y lo cierra. Es la parte común de los dos caminos: el
 * asíncrono, que descarga el resultado de una URL que caduca, y el **síncrono** (ElevenLabs, 0.21.0), que ya
 * tiene los bytes en la mano. Ni el apunte de gasto ni los enganches de escena y de muestra se repiten en
 * ningún otro sitio.
 */
async function guardarArchivoDelTrabajo(
  actor: Actor,
  fila: FilaTrabajo,
  tarea: TareaProveedor,
  archivo: File,
  origen: string | null,
  /** Aviso que sobrevive al cierre: hoy solo el del cambio automático de proveedor de voz (0.21.0). */
  aviso = "",
): Promise<TrabajoVista> {
  const permitidos = TIPO_RESULTADO[fila.kind];
  {
    // La duración del clip es la que se le pidió de verdad al proveedor, que quedó guardada en la entrada del
    // trabajo. Solo si ese trabajo es anterior a que la duración se eligiera se cae en la del catálogo.
    const parametrosPedidos = (fila.input.parametros ?? {}) as Record<string, unknown>;
    const segundosPedidos = parametrosPedidos.segundos;
    const reproduccion =
      fila.kind === "animacion"
        ? {
            duracion:
              typeof segundosPedidos === "number" && segundosPedidos > 0
                ? segundosPedidos
                : ((await duracionDeModelo(fila.provider, fila.model)) ?? CLIP.segundos),
          }
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
        // Un trabajo que sale bien no deja mensaje, **salvo** el del cambio de proveedor: es un aviso, no un
        // error, y decirle a quien paga en qué cuenta se ha gastado no puede depender de que nada más falle.
        errorMessage: aviso === "" ? null : aviso,
        finishedAt: new Date(),
      })
      .where(and(eq(generationJobs.id, fila.id), isNull(generationJobs.resultMediaId)))
      .returning();
    if (cerrada) {
      // Si el trabajo era una vista sintética del personaje, su resultado entra en la ficha **etiquetado**
      // como vista generada. Solo en la rama que cierra el trabajo, así que no se adjunta dos veces.
      await adjuntarVistaGenerada(cerrada, medio.id);
      // Y si era la muestra de una voz (0.21.0), su audio entra en la caché de muestras en lugar de en una escena:
      // es lo que hace que oír esa voz cueste una sola vez.
      await adjuntarMuestraDeVoz(cerrada, medio.id);
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
  }
}

/**
 * Cierra un trabajo de voz de un proveedor **síncrono**, que ha contestado con el audio en la misma llamada
 * (ElevenLabs, 0.21.0). No consulta nada, no descarga nada y no vuelve a llamar a nadie: los bytes ya están.
 *
 * Los créditos son los que **informa el proveedor** en su respuesta, no la estimación: si no informa ninguno se
 * cierra con la estimación del trabajo, igual que cualquier otro cierre sin cifra del proveedor.
 *
 * Y si trae marcas de tiempo medidas sobre el audio, se guardan en la escena: valen más que repartir el tiempo
 * entre las frases a ojo.
 */
export async function cerrarVozSincrona(
  fila: FilaTrabajo,
  resultado: NonNullable<VozPedida["inmediata"]>,
  aviso = "",
): Promise<FilaTrabajo> {
  const actor: Actor = { id: fila.userId, esAdmin: false };
  const tarea: TareaProveedor = {
    estado: "listo",
    estadoPropio: "listo",
    urls: [],
    creditos: resultado.creditosInformados,
    haFallado: false,
  };
  await cerrarGasto(fila.id, tarea.creditos, "Trabajo terminado en el proveedor.");
  const archivo = new File([resultado.audio], resultado.nombre, { type: resultado.mime });
  try {
    // `origen` es `null`: el audio no se ha descargado de ninguna URL, ha venido en la propia respuesta.
    await guardarArchivoDelTrabajo(actor, fila, tarea, archivo, null, aviso);
    // Las marcas se guardan **después** del archivo: si el guardado fallara, la escena se quedaría con la
    // transcripción de un audio que no existe, y con unos subtítulos propuestos sobre algo que nadie puede oír.
    if (resultado.marcas) await guardarMarcasDeVoz(fila, resultado.marcas);
  } catch (error) {
    /**
     * **El dinero ya se ha ido.** El proveedor ha cobrado esta llamada y su audio no se ha podido guardar; como no
     * hay ninguna tarea que volver a consultar —ElevenLabs contesta una sola vez—, ese audio **no se recupera**, y
     * pedirlo otra vez vuelve a cobrar. Es justo el caso en el que el mensaje más importa, así que dice las cuatro
     * cosas: quién, qué, que **sí se ha cobrado** y qué puede hacer quien lo lee.
     *
     * El texto de la excepción se queda **solo en el registro**: viene del almacenamiento y puede llevar claves de
     * objeto o rutas del servidor.
     */
    const detalle = error instanceof Error ? error.message : "Error al guardar el resultado.";
    console.error(`[generacion] voz pagada y no guardada en el trabajo ${fila.id}: ${detalle}`);
    await guardarEstado(fila.id, {
      state: "listo",
      providerState: "listo",
      consumedCredits: tarea.creditos,
      errorMessage: `${PROVEEDORES_PUBLICOS[fila.provider].nombre} (${fila.model}) generó la voz y esa llamada sí se ha cobrado, pero no se ha podido guardar en tu biblioteca por un fallo del almacenamiento de esta instalación, no de tu proyecto ni del proveedor. Ese audio no se puede recuperar: la llamada solo responde una vez, así que generarla otra vez volverá a costar. Avisa a quien administra esta instalación antes de repetirlo.`,
    });
  }
  return (await filaPropia(fila.userId, fila.id)) ?? fila;
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
