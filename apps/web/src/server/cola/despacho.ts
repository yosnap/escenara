import { and, eq, inArray, isNull } from "drizzle-orm";
import { PROVEEDORES_PUBLICOS } from "@/lib/boveda";
import { CAPACIDAD_DE_TIPO, type ModeloVista } from "@/lib/catalogo";
import { leerAjustes } from "../ajustes";
import { usarCredencialValida } from "../boveda/credenciales";
import { hechosDePersonajeCitado, parametrosDeControles } from "../controles/hechos";
import { evaluar, frenosQueGatean } from "../controles/motor";
import { mensajeDeFreno } from "../controles/puerta";
import { db } from "../db/cliente";
import { type FilaMedio, type FilaTrabajo, generationJobs, media } from "../db/esquema";
import { archivoDe } from "../generacion/comprobaciones";
import { olvidarSaldo } from "../generacion/estimacion";
import type { Herramientas } from "../generacion/herramientas";
import { referenciaCompatible } from "../media/conversion-referencia";
import { mediosDeReferenciaVigentes } from "../personajes/consulta";
import { cerrarTrabajoYGasto } from "../presupuesto/reserva";
import { registrarFalloDeEscena } from "../produccion/cierre";
import { type Adaptador, ErrorProveedor } from "../proveedores/contrato";
import { resolver } from "../proveedores/registro";
import { prepararCallback } from "./callback";
import { marcarEnviando, reintentar, renovarToma } from "./toma";

/**
 * Envío al proveedor de un trabajo que el worker ya ha tomado. Es el único sitio desde el que se crea una
 * tarea en el proveedor, y está partido en dos mitades que **no se mezclan**:
 *
 * 1. **Preparar** (estado `preparando`): resolver el modelo, la credencial y la referencia, y montar la
 *    entrada. Nada de esto toca al proveedor con dinero, así que un fallo aquí se puede reintentar.
 * 2. **Llamar y persistir** (estado `enviando`): se marca la fila **antes** de llamar, se llama una sola vez
 *    y después solo se reintenta **la escritura** del identificador de la tarea, nunca la llamada.
 *
 * Las reglas duras, desde 0.10.0 y ahora también frente a fallos de la base de datos:
 *
 * - en cuanto se ha llamado al proveedor, el trabajo **no puede volver a la cola** bajo ninguna circunstancia:
 *   los únicos destinos son `enviado` (se sabe la tarea), `desconocido` (no se sabe) o `fallido` con la
 *   reserva suelta (el proveedor rechazó la petición y no creó nada);
 * - si se obtiene el `taskId` pero no se puede guardar, se insiste en la escritura y, si aun así no se
 *   consigue, se registra el `taskId` en el log (sin ninguna clave) y el trabajo queda `desconocido` con la
 *   reserva retenida: se ha pagado y hay que resolverlo a mano, pero nunca se reenvía. Si ni eso se puede
 *   escribir, la fila se queda en `enviando` **con su toma puesta** y la recoge `recuperarHuerfanos`, que la
 *   deja en `desconocido`: por eso `soltarToma` no suelta nunca una fila `enviando`;
 * - un fallo que sí cierra el trabajo suelta la reserva, porque no ha habido gasto.
 */

/** Motivo normalizado del fallo, tomado del propio esquema para que no pueda desviarse de la enumeración. */
type MotivoFalloTrabajo = NonNullable<FilaTrabajo["failureReason"]>;

/** Intentos de escritura del `taskId` y espera entre ellos. Corto: es la propia base de datos, no una red. */
const INTENTOS_ESCRITURA = 5;
const MS_ENTRE_ESCRITURAS = 200;

export interface Despachado {
  fila: FilaTrabajo;
  enviado: boolean;
}

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

const espera = (ms: number) => new Promise((listo) => setTimeout(listo, ms));

export async function despachar(fila: FilaTrabajo, workerId: string, h: Herramientas): Promise<Despachado> {
  // ── Mitad 1: preparar. Un fallo aquí no ha costado nada y se puede reintentar.
  let preparado: Preparado;
  try {
    preparado = await preparar(fila, workerId, h);
  } catch (error) {
    if (error instanceof ErrorSinCredencial) {
      return { fila: await cerrarSinCoste(fila, "credencial", error.message), enviado: false };
    }
    // El personaje ya no se puede usar: se cierra sin coste y **no se reintenta**. Reintentar esperaría a que
    // alguien volviera a dar un consentimiento que precisamente se ha retirado.
    if (error instanceof ErrorPersonajeNoUsable) {
      return { fila: await cerrarSinCoste(fila, error.motivo, error.message), enviado: false };
    }
    console.error(`[cola] no se ha podido preparar el trabajo ${fila.id}: ${detalle(error)}`);
    await reintentar(fila, "No se ha podido preparar el envío. Se volverá a intentar.", "interno");
    return { fila: (await filaDe(fila.id)) ?? fila, enviado: false };
  }

  // ── Frontera: se marca la fila como «llamada en curso» y se renueva la toma antes de llamar. Si la fila ya
  // no es de este worker, otro la tiene: no se llama al proveedor.
  if (!(await marcarEnviando(fila.id, workerId))) {
    console.warn(`[cola] el trabajo ${fila.id} ya no es de este worker: no se envía`);
    return { fila: (await filaDe(fila.id)) ?? fila, enviado: false };
  }

  // ── Mitad 2: llamar al proveedor. A partir de aquí no hay vuelta a la cola.
  let taskId: string;
  try {
    taskId = await llamarAlProveedor(fila, preparado, h);
  } catch (error) {
    return { fila: await tratarFalloDeLlamada(fila, error), enviado: false };
  }
  // El saldo del proveedor acaba de cambiar: la próxima estimación lo vuelve a preguntar.
  olvidarSaldo(fila.userId);

  // ── Persistencia del identificador, con reintentos **solo de la escritura**.
  const guardada = await guardarTarea(fila, taskId, preparado.callbackTokenHash);
  if (guardada) return { fila: guardada, enviado: true };
  return { fila: await marcarTareaPerdida(fila, taskId), enviado: false };
}

/** Lo que hace falta para llamar al proveedor, ya resuelto y sin tocar la base de datos. */
interface Preparado {
  adaptador: Adaptador;
  clave: string;
  entrada: Record<string, unknown>;
  /** URL de callback que se le da al proveedor, o `undefined` si esta instalación no los usa. */
  callbackUrl?: string;
  /** Huella del token de esa URL, que se guarda con el trabajo. */
  callbackTokenHash?: string;
}

/** La credencial del usuario no sirve: no es un fallo reintentable, es algo que tiene que arreglar él. */
class ErrorSinCredencial extends Error {}

/**
 * El personaje del trabajo ya no puede generar (consentimiento revocado o rechazado, referencias por debajo
 * del mínimo, o un modelo que dejó de aceptar referencias). No es reintentable: el trabajo se cierra sin coste.
 */
class ErrorPersonajeNoUsable extends Error {
  constructor(
    mensaje: string,
    readonly motivo: MotivoFalloTrabajo = "consentimiento",
  ) {
    super(mensaje);
    this.name = "ErrorPersonajeNoUsable";
  }
}

async function preparar(fila: FilaTrabajo, workerId: string, h: Herramientas): Promise<Preparado> {
  const { modelo, adaptador } = await resolver(CAPACIDAD_DE_TIPO[fila.kind], fila.model);
  // ── Reevaluación de los controles previos, **antes** de subir nada. El encolado los evaluó, pero entre
  // encolar y enviar el usuario puede haber revocado el consentimiento o borrado fotos, y en un reintento puede
  // haber pasado más rato todavía. Sin esto, revocar no impediría que la cara saliera hacia el proveedor: solo
  // impediría pedir trabajos nuevos, que es la mitad de la regla.
  //
  // Se reevalúan las reglas que **pueden haber cambiado sin que el usuario pida nada** y que se pueden decidir
  // con lo que hay en la fila: el consentimiento del personaje y si el modelo sigue aceptando referencias. Las
  // de dinero no: su reserva ya está apartada desde el encolado, y volver a compararlas aquí rechazaría un
  // trabajo por su propia reserva.
  if (fila.characterId) {
    const freno = frenosQueGatean(
      evaluar({
        tipo: fila.kind,
        parametros: await parametrosDeControles(),
        // Si la ficha del personaje ya no está, esto bloquea en lugar de dejar pasar: un borrado a medias no
        // puede convertirse en un envío sin consentimiento.
        personaje: await hechosDePersonajeCitado(fila.characterId),
        modelo: {
          nombre: modelo.nombre,
          maximoReferencias: modelo.parametros.maximoReferencias,
          // El precio y la acotación se decidieron al encolar y su reserva ya está apartada: volver a
          // juzgarlos aquí rechazaría el trabajo por su propio apartado.
          precioComprobado: "",
          precioCaducado: false,
          costeAcotado: true,
          motivoSinAcotar: "",
        },
      }),
    )[0];
    if (freno) {
      throw new ErrorPersonajeNoUsable(
        `${mensajeDeFreno(freno)} No se ha enviado nada y no se te ha cobrado.`,
        freno.regla === "consentimiento" ? "consentimiento" : "interno",
      );
    }
  }
  const credencial = await usarCredencialValida(fila.userId, fila.provider);
  if (!credencial.ok) {
    const nombre = PROVEEDORES_PUBLICOS[fila.provider].nombre;
    throw new ErrorSinCredencial(
      `No hay una clave de ${nombre} utilizable en tu cuenta. Añádela en «Tu cuenta» y vuelve a pedir el trabajo.`,
    );
  }
  // Un trabajo con personaje lleva **varias** referencias (0.13.0); uno con imagen suelta, una sola. Se
  // suben en el mismo orden que se guardaron: la primera es la que más peso tiene en la identidad.
  const origenes = await mediosDeReferencia(fila, Math.max(1, modelo.parametros.maximoReferencias));
  const urls: string[] = [];
  for (const origen of origenes) {
    // Cada subida renueva la toma: con diez referencias, la preparación puede pasar de los tres minutos que
    // dura, y una toma caducada dejaría que otro worker preparase el mismo trabajo en paralelo.
    if (!(await renovarToma(fila.id, workerId))) {
      throw new Error(`El trabajo ${fila.id} ha dejado de ser de este worker mientras se preparaba.`);
    }
    urls.push(await subirReferencia(adaptador, credencial.clave, origen, modelo, h));
  }
  /**
   * La entrada se vuelve a montar aquí (las URL del proveedor caducan y no se guardan), pero **la duración es la
   * que se decidió al encolar**, no la que declare hoy el catálogo: es la que se estimó, la que confirmó el
   * usuario y la del proyecto. Volver a deducirla cambiaría el clip que se paga.
   */
  const segundos = segundosDe(fila);
  const entrada = adaptador.montarEntrada(modelo, {
    escena: fila.prompt,
    dialogo: dialogoDe(fila),
    urls,
    ...(segundos === null ? {} : { segundos }),
  });
  const callback = await prepararCallback(fila);
  return { adaptador, clave: credencial.clave, entrada, ...callback };
}

function llamarAlProveedor(fila: FilaTrabajo, preparado: Preparado, h: Herramientas): Promise<string> {
  const peticion = {
    clave: preparado.clave,
    modelo: fila.model,
    entrada: preparado.entrada,
    buscar: h.buscar,
    callbackUrl: preparado.callbackUrl,
  };
  return fila.kind === "animacion"
    ? preparado.adaptador.generarVideo(peticion)
    : preparado.adaptador.generarImagen(peticion);
}

/**
 * Guarda el identificador de la tarea, insistiendo si la base de datos falla. Devuelve la fila guardada o
 * `null` si no se ha conseguido. **No reintenta la llamada al proveedor**: eso ya ha pasado.
 */
async function guardarTarea(
  fila: FilaTrabajo,
  taskId: string,
  callbackTokenHash: string | undefined,
): Promise<FilaTrabajo | null> {
  for (let intento = 1; intento <= INTENTOS_ESCRITURA; intento++) {
    try {
      const [enviada] = await db()
        .update(generationJobs)
        .set({
          taskId,
          state: "enviado",
          // La tarea existe en el proveedor: es la segunda etapa real.
          stage: "enviado",
          sentAt: new Date(),
          errorMessage: null,
          failureReason: null,
          lockedBy: null,
          lockedUntil: null,
          ...(callbackTokenHash ? { callbackTokenHash } : {}),
        })
        // Solo se marca si seguía sin tarea: dos despachos del mismo trabajo no se pisan.
        .where(and(eq(generationJobs.id, fila.id), isNull(generationJobs.taskId)))
        .returning();
      if (enviada) return enviada;
      // Ya tenía tarea (otro despacho la guardó): se devuelve lo que hay, sin tocar nada.
      return await filaDe(fila.id);
    } catch (error) {
      console.error(`[cola] intento ${intento} de guardar la tarea del trabajo ${fila.id}: ${detalle(error)}`);
      if (intento < INTENTOS_ESCRITURA) await espera(MS_ENTRE_ESCRITURAS * intento);
    }
  }
  return null;
}

/**
 * El proveedor ha aceptado el trabajo pero no se ha podido guardar su identificador. Se registra el `taskId`
 * en el log (nunca la clave) para poder resolverlo a mano y se deja el trabajo en revisión con la reserva
 * retenida. Si ni eso se puede escribir, al menos queda el registro.
 */
async function marcarTareaPerdida(fila: FilaTrabajo, taskId: string): Promise<FilaTrabajo> {
  console.error(
    `[cola] TAREA CREADA Y NO GUARDADA · trabajo=${fila.id} usuario=${fila.userId} proveedor=${fila.provider} tarea=${taskId} · el trabajo queda en revisión y NO se reenviará`,
  );
  const nombre = PROVEEDORES_PUBLICOS[fila.provider].nombre;
  const mensaje = `El trabajo se ha encargado a ${nombre}, pero no se ha podido guardar su identificador. No se reenviará: quien administra esta instalación lo resolverá con el registro del servidor.`;
  for (let intento = 1; intento <= INTENTOS_ESCRITURA; intento++) {
    try {
      const [fallida] = await db()
        .update(generationJobs)
        .set({
          state: "desconocido",
          failureReason: "temporal",
          errorMessage: mensaje,
          lockedBy: null,
          lockedUntil: null,
          finishedAt: new Date(),
        })
        // Solo si la fila sigue como la dejamos: en `enviando` y sin tarea guardada. Si otro camino ya la ha
        // movido (la escritura del identificador que creíamos fallida acabó entrando, por ejemplo), no se pisa.
        .where(and(eq(generationJobs.id, fila.id), eq(generationJobs.state, "enviando"), isNull(generationJobs.taskId)))
        .returning();
      if (fallida) return fallida;
      // No ha afectado a ninguna fila: se relee y se devuelve la de verdad, no una inventada.
      return (await filaDe(fila.id)) ?? fila;
    } catch (error) {
      console.error(`[cola] intento ${intento} de marcar en revisión el trabajo ${fila.id}: ${detalle(error)}`);
      if (intento < INTENTOS_ESCRITURA) await espera(MS_ENTRE_ESCRITURAS * intento);
    }
  }
  // La base de datos no responde ni para esto. La fila se queda en `enviando` **con su toma puesta**
  // (`soltarToma` no toca ese estado), así que caducará y `recuperarHuerfanos` la dejará en `desconocido` con
  // la reserva retenida, sin reenviarla. Lo que se devuelve aquí es solo para el registro de esta pasada.
  return { ...fila, state: "desconocido", failureReason: "temporal", errorMessage: mensaje };
}

/**
 * Qué hacer con un fallo de la llamada al proveedor. **Ninguna rama vuelve a la cola**: o no se sabe qué ha
 * pasado (`desconocido`, reserva retenida) o el proveedor ha rechazado la petición con una respuesta, y
 * entonces se sabe que no creó nada y el trabajo se cierra soltando la reserva.
 */
async function tratarFalloDeLlamada(fila: FilaTrabajo, error: unknown): Promise<FilaTrabajo> {
  // Solo se da por «no cobrado» lo que el proveedor ha **rechazado con una respuesta que lo prueba**
  // (`ErrorProveedor.rechazoProbado`: clave inválida, sin saldo, exceso de ritmo). Un 5xx, un 200 sin
  // identificador de tarea, una red caída o un tiempo agotado no prueban nada: pueden venir de un trabajo ya
  // aceptado, y decidir «no cobrado» por descarte es justo lo que provoca los dobles cobros.
  if (error instanceof ErrorProveedor && error.rechazoProbado) {
    return cerrarSinCoste(fila, error.motivo, `${error.message} No se ha enviado nada y no se te ha cobrado.`);
  }
  const nombre = PROVEEDORES_PUBLICOS[fila.provider].nombre;
  const explicacion = error instanceof ErrorProveedor ? error.message : "El envío ha fallado de forma inesperada.";
  if (!(error instanceof ErrorProveedor)) {
    console.error(`[cola] fallo tras llamar al proveedor en el trabajo ${fila.id}: ${detalle(error)}`);
  }
  // Reserva retenida a propósito: quizá se ha pagado y todavía no lo sabemos.
  return marcar(fila.id, {
    state: "desconocido",
    failureReason: error instanceof ErrorProveedor ? error.motivo : "respuesta",
    errorMessage: `${explicacion} No sabemos si el proveedor ha aceptado el trabajo, así que no se reenviará: revisa el historial de tu cuenta en ${nombre} antes de pedirlo otra vez.`,
    lockedBy: null,
    lockedUntil: null,
    finishedAt: new Date(),
  });
}

/** Cierra el trabajo como fallido y suelta su reserva: el proveedor no ha llegado a crear la tarea. */
async function cerrarSinCoste(fila: FilaTrabajo, motivo: MotivoFalloTrabajo, mensaje: string): Promise<FilaTrabajo> {
  // El cambio de estado y la liberación de la reserva van juntos: si el apunte fallara después del `UPDATE`, el
  // trabajo quedaría cerrado con su presupuesto apartado para siempre.
  const cerrada = await cerrarTrabajoYGasto(
    fila.id,
    undefined,
    {
      state: "fallido",
      failureReason: motivo,
      errorMessage: mensaje,
      finishedAt: new Date(),
      lockedBy: null,
      lockedUntil: null,
    },
    0,
    "El trabajo no ha llegado a enviarse al proveedor: no ha costado nada.",
  );
  if (!cerrada) throw new Error(`El trabajo ${fila.id} ha desaparecido mientras se despachaba.`);
  // Si producía una escena, la escena apunta por qué no salió. Sin coste y **sin reenviar nada** (0.19.0).
  await registrarFalloDeEscena(cerrada, mensaje);
  return cerrada;
}

async function marcar(id: string, cambios: Partial<typeof generationJobs.$inferInsert>): Promise<FilaTrabajo> {
  const [fila] = await db().update(generationJobs).set(cambios).where(eq(generationJobs.id, id)).returning();
  if (!fila) throw new Error(`El trabajo ${id} ha desaparecido mientras se despachaba.`);
  return fila;
}

async function filaDe(id: string): Promise<FilaTrabajo | null> {
  const [fila] = await db().select().from(generationJobs).where(eq(generationJobs.id, id)).limit(1);
  return fila ?? null;
}

/**
 * Duración que se le pidió al proveedor al encolar, tal como quedó en la entrada guardada; `null` en un trabajo
 * anterior a que la duración se eligiera, que se queda con la que declare su modelo.
 */
function segundosDe(fila: FilaTrabajo): number | null {
  const parametros = (fila.input as { parametros?: unknown }).parametros;
  if (!parametros || typeof parametros !== "object") return null;
  const segundos = (parametros as { segundos?: unknown }).segundos;
  return typeof segundos === "number" && segundos > 0 ? segundos : null;
}

/** Lo que dice el personaje, tal como se guardó al encolar. Solo lo usa el clip. */
function dialogoDe(fila: FilaTrabajo): string {
  const dialogo = (fila.input as { dialogo?: unknown }).dialogo;
  return typeof dialogo === "string" ? dialogo : "";
}

/**
 * Referencias del trabajo, en el orden en que se guardaron al encolar, **cruzadas con lo que sigue siendo
 * verdad**: se recortan al tope del modelo (el catálogo puede haber cambiado) y, si el trabajo lleva personaje,
 * se descarta lo que ya no sea referencia suya o esté en la papelera.
 *
 * Es la otra mitad de la revalidación: comprobar el consentimiento no basta si entre encolar y enviar el usuario
 * ha quitado fotos o las ha mandado a la papelera. Si quedan por debajo del mínimo, el trabajo se cierra sin
 * subir nada, igual que si el consentimiento se hubiera revocado.
 */
async function mediosDeReferencia(fila: FilaTrabajo, maximo = Number.POSITIVE_INFINITY): Promise<FilaMedio[]> {
  const guardadas = (fila.input as { referencias?: unknown }).referencias;
  let ids = Array.isArray(guardadas) ? guardadas.filter((id): id is string => typeof id === "string") : [];
  // Solo un **fotograma** envía las fotos del personaje. Un clip envía su fotograma aprobado, que no es una
  // referencia del personaje: filtrarlo contra ellas lo descartaba y ningún clip con personaje llegaba a salir.
  // El consentimiento del personaje del clip ya lo ha revisado la puerta de `preparar`.
  if (fila.characterId && fila.kind === "fotograma") {
    // Solo lo que sigue siendo referencia del personaje y fuera de la papelera, respetando el orden guardado.
    const referencias = await mediosDeReferenciaVigentes(fila.characterId);
    const vigentes = new Map(referencias.map((r) => [r.mediaId, r.origen]));
    ids = ids.filter((id) => vigentes.has(id));
    const { minimoReferenciasPersonaje: minimo } = await leerAjustes();
    // El mínimo lo sostienen solo las fotos originales: una vista generada se envía como guía, pero no
    // sustituye a una foto de la persona (0.14.0).
    if (ids.filter((id) => vigentes.get(id) === "foto_original").length < minimo) {
      throw new ErrorPersonajeNoUsable(
        `Las fotos de referencia del personaje han cambiado desde que pediste el trabajo y ya no llegan al mínimo de ${minimo}. No se ha enviado nada y no se te ha cobrado: añade más fotos y vuelve a pedirlo.`,
      );
    }
  }
  ids = ids.slice(0, maximo);
  if (ids.length === 0) {
    if (!fila.sourceMediaId) throw new Error("El trabajo no tiene imagen de referencia.");
    ids.push(fila.sourceMediaId);
  }
  // Un medio en la papelera no se envía nunca: su archivo puede desaparecer en cualquier momento.
  const filas = await db()
    .select()
    .from(media)
    .where(and(inArray(media.id, ids), isNull(media.deletedAt)));
  const porId = new Map(filas.map((m) => [m.id, m]));
  // Se respeta el orden guardado, no el que devuelva la consulta.
  const origenes = ids.flatMap((id) => {
    const medio = porId.get(id);
    return medio ? [medio] : [];
  });
  if (origenes.length === 0) throw new Error("Las imágenes de referencia ya no existen.");
  return origenes;
}

/**
 * Sube la referencia al proveedor, convirtiéndola antes si ese modelo no acepta el formato en que la guarda
 * la biblioteca (Kling v3 turbo solo admite JPEG o PNG y los fotogramas son WebP).
 */
async function subirReferencia(
  adaptador: Adaptador,
  clave: string,
  origen: FilaMedio,
  modelo: ModeloVista,
  h: Herramientas,
): Promise<string> {
  const archivo = await referenciaCompatible(await archivoDe(origen), modelo.parametros.formatosReferencia);
  return adaptador.subirReferencia({ clave, archivo, buscar: h.buscar });
}
