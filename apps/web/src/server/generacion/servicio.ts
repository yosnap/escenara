import { and, eq, isNull, sql } from "drizzle-orm";
import {
  CLIP,
  DIALOGO_MAXIMO,
  MODELOS,
  PROMPT_MAXIMO,
  PROMPT_MINIMO,
  TIPO_RESULTADO,
  type TipoTrabajo,
  type TrabajoVista,
} from "@/lib/generacion";
import { formatearTamano } from "@/lib/media/reglas";
import { leerAjustes } from "../ajustes";
import { leerObjeto } from "../almacenamiento";
import { usarCredencialValida } from "../boveda/credenciales";
import { db } from "../db/cliente";
import { type FilaMedio, type FilaTrabajo, generationJobs, media } from "../db/esquema";
import { dentroDelLimite, type Limite } from "../limite";
import { type Actor, espacioUsado, limiteSubida } from "../media/servicio";
import type { Buscador } from "../proveedores/codigos";
import { crearTarea, ErrorKie, subirReferencia } from "../proveedores/kie/cliente";
import { entradaAnimacion, entradaFotograma } from "../proveedores/kie/modelos";
import { ErrorGeneracion } from "./errores";
import { olvidarSaldo, saldoDelUsuario } from "./estimacion";
import { HERRAMIENTAS, type Herramientas } from "./herramientas";
import { precioDe } from "./precios";
import { condicionEnCurso, esUuidGeneracion, filaPropia, vistaDeFila } from "./trabajos";

/**
 * Envío de trabajos a KIE con la clave del propio usuario (RF01). Reglas duras de esta versión:
 *
 * - nada se envía sin una confirmación explícita que incluya los créditos estimados que se mostraron: si
 *   el precio ha cambiado entre la pantalla y el botón, se rechaza y se vuelve a mostrar;
 * - si no se sabe si el proveedor ha aceptado el trabajo (tiempo agotado o red caída al crearlo), el
 *   trabajo queda `desconocido` y **nunca** se reenvía: reenviar podría cobrar dos veces;
 * - la casilla de derecho de uso de la imagen es obligatoria y queda registrada con su fecha;
 * - cada confirmación lleva su clave de idempotencia: repetirla (doble clic, reintento tras un error de
 *   red) devuelve el trabajo que ya existe y no crea una segunda tarea en el proveedor;
 * - la comprobación del tope de trabajos en curso y el alta del trabajo van en una transacción que bloquea
 *   la fila del usuario, así que dos envíos a la vez no pueden pasarse del tope (igual que la cuota de la
 *   biblioteca en `media/servicio.ts`).
 */

/** Trabajos simultáneos por usuario: la cola con workers y su límite configurable llegan en 0.12.0. */
const MAXIMO_EN_CURSO = 3;

/** Ritmo máximo de envíos por usuario: un accidente (o un script) no puede vaciarle la cuenta. */
const RITMO_ENVIOS: Limite = { ventanaSegundos: 60 * 60, maximo: 40 };

/** Confirmación común a los dos tipos de trabajo. */
interface Confirmacion {
  prompt: string;
  /** Créditos que el usuario tenía delante al confirmar. */
  creditosConfirmados: number;
  /** Casilla «tengo derecho a usar esta imagen». */
  derechos: boolean;
  /** Aviso aceptado cuando la estimación pasa del umbral configurado en Admin › Ajustes. */
  avisoUmbralAceptado?: boolean;
  /** Clave que genera el navegador al confirmar: la misma confirmación nunca se cobra dos veces. */
  claveIdempotencia: string;
}

/**
 * Resultado de un envío. `nueva` es `false` cuando la confirmación ya se había enviado (misma clave de
 * idempotencia): el trabajo que se devuelve es el que ya existía y no se ha llamado al proveedor.
 */
export interface Envio {
  trabajo: TrabajoVista;
  nueva: boolean;
}

export interface PeticionFotograma extends Confirmacion {
  /** Imagen de la biblioteca del usuario que sirve de referencia. */
  medioId: string;
}

export interface PeticionAnimacion extends Confirmacion {
  /** Fotograma ya generado que se anima (su medio es el primer fotograma del clip). */
  trabajoPadreId: string;
  /** Lo que dice el personaje, opcional. Solo lo usa el clip: en el fotograma saldría escrito. */
  dialogo?: string;
}

function limpiarPrompt(prompt: unknown): string {
  const texto = typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ") : "";
  if (texto.length < PROMPT_MINIMO) {
    throw new ErrorGeneracion(400, `Describe la escena con al menos ${PROMPT_MINIMO} caracteres.`);
  }
  if (texto.length > PROMPT_MAXIMO) {
    throw new ErrorGeneracion(400, `La descripción no puede pasar de ${PROMPT_MAXIMO} caracteres.`);
  }
  return texto;
}

/**
 * Limpia lo que dice el personaje. Se quitan los saltos de línea y las comillas: el diálogo se le pasa a
 * Veo con dos puntos y sin comillas, que es lo que menos texto incrustado provoca.
 */
function limpiarDialogo(dialogo: unknown): string {
  if (dialogo === undefined || dialogo === null || dialogo === "") return "";
  if (typeof dialogo !== "string") throw new ErrorGeneracion(400, "Lo que dice tiene que ser texto.");
  // El tope se comprueba **antes** de limpiar: ninguna expresión regular recorre un texto enorme.
  if (dialogo.length > DIALOGO_MAXIMO) {
    throw new ErrorGeneracion(400, `Lo que dice no puede pasar de ${DIALOGO_MAXIMO} caracteres.`);
  }
  return dialogo
    .replace(/[\r\n"“”«»‘’']+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function exigirDerechos(derechos: unknown) {
  if (derechos !== true) {
    throw new ErrorGeneracion(400, "Confirma que tienes derecho a usar esa imagen antes de generar.");
  }
}

/** La confirmación vale para el precio que se mostró y para ningún otro. */
function exigirConfirmacion(confirmados: unknown, creditos: number) {
  if (typeof confirmados !== "number" || !Number.isFinite(confirmados)) {
    throw new ErrorGeneracion(400, "Falta la confirmación del coste estimado.");
  }
  if (confirmados !== creditos) {
    throw new ErrorGeneracion(
      409,
      `El coste estimado ha cambiado: ahora son ${creditos} créditos. Revísalo y vuelve a confirmar.`,
    );
  }
}

/** El aviso por gasto alto lo comprueba el servidor: es un aviso obligatorio, no un tope. */
async function exigirAvisoUmbral(creditos: number, aceptado: unknown) {
  const { avisoCreditos } = await leerAjustes();
  if (creditos > avisoCreditos && aceptado !== true) {
    throw new ErrorGeneracion(
      400,
      `Este trabajo pasa del aviso de ${avisoCreditos} créditos. Confirma que quieres gastarlos.`,
    );
  }
}

/** Clave de idempotencia: la genera el navegador y tiene que ser un UUID. */
function exigirClaveIdempotencia(clave: unknown): string {
  if (!esUuidGeneracion(clave)) throw new ErrorGeneracion(400, "Falta la clave de la confirmación.");
  return clave;
}

async function exigirCredencial(usuarioId: string): Promise<string> {
  const credencial = await usarCredencialValida(usuarioId, "kie");
  if (credencial.ok) return credencial.clave;
  const MENSAJE = {
    boveda: "Esta instalación aún no admite credenciales: pídeselo a quien la administra.",
    "sin-credencial": "No tienes ninguna clave de KIE guardada. Añádela en «Tu cuenta».",
    invalida: "Tu clave de KIE está marcada como no válida. Pruébala o sustitúyela en «Tu cuenta».",
    ilegible: "La clave guardada no se puede leer en esta instalación. Bórrala y vuelve a guardarla.",
  } as const;
  throw new ErrorGeneracion(409, MENSAJE[credencial.motivo]);
}

async function exigirRitmo(usuarioId: string) {
  if (!(await dentroDelLimite(`generacion:envio:${usuarioId}`, RITMO_ENVIOS))) {
    throw new ErrorGeneracion(429, "Has pedido demasiadas generaciones seguidas. Espera un rato.");
  }
}

/**
 * La cuota se comprueba **antes** de gastar: guardar el resultado no puede quedarse sin sitio. Se reserva
 * el peor caso real del tipo de archivo (el máximo que admite la biblioteca), no una media: un clip que no
 * cupiera se habría pagado ya.
 */
async function exigirCuota(actor: Actor, tipo: TipoTrabajo) {
  const previsto = limiteSubida(TIPO_RESULTADO[tipo]);
  const { usadoBytes, cuotaBytes } = await espacioUsado(actor);
  if (cuotaBytes !== null && usadoBytes + previsto > cuotaBytes) {
    throw new ErrorGeneracion(
      413,
      `Necesitas ${formatearTamano(previsto)} libres en la biblioteca para guardar el resultado y te quedan ${formatearTamano(Math.max(0, cuotaBytes - usadoBytes))}. Vacía la papelera o borra archivos antes de generar.`,
    );
  }
}

async function exigirSaldo(usuarioId: string, creditos: number, buscar: Buscador) {
  const saldo = await saldoDelUsuario(usuarioId, buscar);
  if (saldo !== null && saldo < creditos) {
    throw new ErrorGeneracion(
      402,
      `Tu cuenta de KIE tiene ${saldo} créditos y este trabajo necesita ${creditos}. Recarga créditos en el proveedor.`,
    );
  }
}

/** Imagen propia, existente y fuera de la papelera: lo ajeno responde 404, como en la biblioteca. */
async function imagenPropia(usuarioId: string, medioId: unknown): Promise<FilaMedio> {
  // El identificador llega del navegador: se valida como UUID antes de consultar nada.
  if (!esUuidGeneracion(medioId)) throw new ErrorGeneracion(400, "Elige una imagen de referencia.");
  const [fila] = await db()
    .select()
    .from(media)
    .where(and(eq(media.id, medioId), eq(media.ownerId, usuarioId), isNull(media.deletedAt)))
    .limit(1);
  if (!fila) throw new ErrorGeneracion(404, "La imagen no existe.");
  if (fila.kind !== "imagen") throw new ErrorGeneracion(400, "La referencia tiene que ser una imagen.");
  return fila;
}

/** Baja el archivo del almacenamiento propio para subirlo al proveedor. */
async function archivoDe(fila: FilaMedio): Promise<File> {
  const datos = await leerObjeto(fila.storageKey).arrayBuffer();
  return new File([datos], fila.originalName || "referencia", { type: fila.mimeType });
}

/**
 * Lo que se guarda como entrada del trabajo: `prompt` es lo que escribió la persona y `parametros` lo que
 * se le envió al proveedor (incluido el prompt ya montado, útil para entender un resultado raro). Nunca
 * incluye las URL temporales del proveedor ni ningún secreto.
 */
function entradaGuardada(prompt: string, referencias: string[], parametros: Record<string, unknown>) {
  const { image_urls: _urlsTemporales, ...resto } = parametros;
  return { prompt, referencias, parametros: resto };
}

export async function crearFotograma(
  actor: Actor,
  peticion: PeticionFotograma,
  h: Herramientas = HERRAMIENTAS,
): Promise<Envio> {
  const prompt = limpiarPrompt(peticion.prompt);
  exigirDerechos(peticion.derechos);
  const claveIdempotencia = exigirClaveIdempotencia(peticion.claveIdempotencia);
  const precio = await precioDe("fotograma");
  const creditos = Math.ceil(precio.creditos);
  exigirConfirmacion(peticion.creditosConfirmados, creditos);
  await exigirAvisoUmbral(creditos, peticion.avisoUmbralAceptado);
  const yaHecho = await trabajoDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaHecho) return { trabajo: yaHecho, nueva: false };
  const clave = await exigirCredencial(actor.id);
  const origen = await imagenPropia(actor.id, peticion.medioId);
  await exigirCuota(actor, "fotograma");
  await exigirSaldo(actor.id, creditos, h.buscar);
  await exigirRitmo(actor.id);

  const parametros = entradaFotograma(prompt, []);
  const reserva = await reservar(actor.id, claveIdempotencia, {
    userId: actor.id,
    kind: "fotograma",
    provider: "kie",
    model: MODELOS.fotograma,
    prompt,
    input: entradaGuardada(prompt, [origen.id], parametros),
    sourceMediaId: origen.id,
    estimatedCredits: creditos,
  });
  if (!reserva.nueva) return { trabajo: await vistaDeFila(reserva.fila), nueva: false };

  const trabajo = await enviar(reserva.fila, clave, h, async () => {
    const url = await subirReferencia(clave, await archivoDe(origen), h.buscar);
    return entradaFotograma(prompt, [url]);
  });
  return { trabajo, nueva: true };
}

export async function crearAnimacion(
  actor: Actor,
  peticion: PeticionAnimacion,
  h: Herramientas = HERRAMIENTAS,
): Promise<Envio> {
  const prompt = limpiarPrompt(peticion.prompt);
  exigirDerechos(peticion.derechos);
  const claveIdempotencia = exigirClaveIdempotencia(peticion.claveIdempotencia);
  const precio = await precioDe("animacion");
  const creditos = Math.ceil(precio.creditos);
  exigirConfirmacion(peticion.creditosConfirmados, creditos);
  await exigirAvisoUmbral(creditos, peticion.avisoUmbralAceptado);
  const yaHecho = await trabajoDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaHecho) return { trabajo: yaHecho, nueva: false };
  const clave = await exigirCredencial(actor.id);

  if (!esUuidGeneracion(peticion.trabajoPadreId)) throw new ErrorGeneracion(404, "El trabajo no existe.");
  const padre = await filaPropia(actor.id, peticion.trabajoPadreId);
  if (padre.kind !== "fotograma") throw new ErrorGeneracion(400, "Solo se animan fotogramas.");
  if (padre.state !== "listo" || !padre.resultMediaId) {
    throw new ErrorGeneracion(409, "Espera a que el fotograma esté listo y guardado antes de animarlo.");
  }
  const origen = await imagenPropia(actor.id, padre.resultMediaId);
  await exigirCuota(actor, "animacion");
  await exigirSaldo(actor.id, creditos, h.buscar);
  await exigirRitmo(actor.id);

  const dialogo = limpiarDialogo(peticion.dialogo);
  const parametros = entradaAnimacion(prompt, dialogo, "");
  const reserva = await reservar(actor.id, claveIdempotencia, {
    userId: actor.id,
    kind: "animacion",
    provider: "kie",
    model: MODELOS.animacion,
    prompt,
    input: { ...entradaGuardada(prompt, [origen.id], { ...parametros, segundos: CLIP.segundos }), dialogo },
    sourceMediaId: origen.id,
    parentJobId: padre.id,
    estimatedCredits: creditos,
  });
  if (!reserva.nueva) return { trabajo: await vistaDeFila(reserva.fila), nueva: false };

  const trabajo = await enviar(reserva.fila, clave, h, async () => {
    const url = await subirReferencia(clave, await archivoDe(origen), h.buscar);
    return entradaAnimacion(prompt, dialogo, url);
  });
  return { trabajo, nueva: true };
}

type NuevoTrabajo = Omit<typeof generationJobs.$inferInsert, "rightsConfirmedAt" | "idempotencyKey">;

/** Trabajo que ya salió de esta misma confirmación, si lo hay. */
async function trabajoDeLaConfirmacion(usuarioId: string, claveIdempotencia: string): Promise<TrabajoVista | null> {
  const fila = await filaDeLaConfirmacion(usuarioId, claveIdempotencia);
  return fila ? vistaDeFila(fila) : null;
}

async function filaDeLaConfirmacion(usuarioId: string, claveIdempotencia: string): Promise<FilaTrabajo | null> {
  const [fila] = await db()
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.userId, usuarioId), eq(generationJobs.idempotencyKey, claveIdempotencia)))
    .limit(1);
  return fila ?? null;
}

/**
 * Comprueba el tope de trabajos en curso y da de alta el trabajo en una sola transacción, con la fila del
 * usuario bloqueada: dos envíos simultáneos se ponen en fila y el segundo ve lo que hizo el primero, así
 * que ni se pasan del tope ni repiten la misma confirmación.
 */
async function reservar(
  usuarioId: string,
  claveIdempotencia: string,
  valores: NuevoTrabajo,
): Promise<{ fila: FilaTrabajo; nueva: boolean }> {
  try {
    return await db().transaction(async (tx) => {
      await tx.execute(sql`select 1 from users where id = ${usuarioId} for update`);
      const [repetida] = await tx
        .select()
        .from(generationJobs)
        .where(and(eq(generationJobs.userId, usuarioId), eq(generationJobs.idempotencyKey, claveIdempotencia)))
        .limit(1);
      if (repetida) return { fila: repetida, nueva: false };
      const [{ total } = { total: 0 }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(generationJobs)
        .where(and(eq(generationJobs.userId, usuarioId), condicionEnCurso()));
      if (total >= MAXIMO_EN_CURSO) {
        throw new ErrorGeneracion(429, "Ya tienes trabajos en marcha. Espera a que terminen antes de pedir otro.");
      }
      const [fila] = await tx
        .insert(generationJobs)
        // La confirmación de derechos se guarda con su fecha: ya se ha comprobado que llegó marcada.
        .values({ ...valores, idempotencyKey: claveIdempotencia, rightsConfirmedAt: new Date() })
        .returning();
      if (!fila) throw new ErrorGeneracion(500, "No se ha podido registrar el trabajo.");
      return { fila, nueva: true };
    });
  } catch (error) {
    // Red de seguridad: si aun así chocaran las dos inserciones, manda la que ya está guardada.
    if (esClaveRepetida(error)) {
      const fila = await filaDeLaConfirmacion(usuarioId, claveIdempotencia);
      if (fila) return { fila, nueva: false };
    }
    throw error;
  }
}

/** Violación de una restricción de unicidad en PostgreSQL. */
function esClaveRepetida(error: unknown): boolean {
  const codigo = (error as { code?: unknown; errno?: unknown } | null)?.code;
  return codigo === "23505" || String((error as Error)?.message ?? "").includes("generation_jobs_usuario_idempotencia");
}

/**
 * Sube la referencia, crea la tarea y guarda su identificador. Si no se sabe si el proveedor la ha
 * aceptado, el trabajo queda `desconocido`: nunca se reintenta el envío desde aquí.
 */
async function enviar(
  fila: FilaTrabajo,
  clave: string,
  h: Herramientas,
  preparar: () => Promise<Record<string, unknown>>,
): Promise<TrabajoVista> {
  try {
    const entrada = await preparar();
    const taskId = await crearTarea(clave, fila.model, entrada, h.buscar);
    // El saldo acaba de cambiar: la próxima estimación lo vuelve a preguntar.
    olvidarSaldo(fila.userId);
    return await actualizar(fila.id, { taskId, state: "enviado", sentAt: new Date() });
  } catch (error) {
    if (!(error instanceof ErrorKie)) {
      console.error(`[generacion] fallo al enviar el trabajo ${fila.id}: ${(error as Error).message}`);
      return actualizar(fila.id, {
        state: "fallido",
        errorMessage: "No se ha podido preparar el envío. Vuelve a intentarlo.",
        finishedAt: new Date(),
      });
    }
    // Un tiempo agotado o una red caída no dicen si la tarea existe ya en el proveedor.
    const sinRespuesta = error.codigo === "tiempo-agotado" || error.codigo === "sin-red";
    return actualizar(fila.id, {
      state: sinRespuesta ? "desconocido" : "fallido",
      errorMessage: sinRespuesta
        ? `${error.message} No sabemos si el proveedor ha aceptado el trabajo, así que no se reenviará: revisa el historial de tu cuenta de KIE antes de pedirlo otra vez.`
        : error.message,
      finishedAt: sinRespuesta ? null : new Date(),
    });
  }
}

async function actualizar(id: string, cambios: Partial<typeof generationJobs.$inferInsert>): Promise<TrabajoVista> {
  const [fila] = await db().update(generationJobs).set(cambios).where(eq(generationJobs.id, id)).returning();
  if (!fila) throw new ErrorGeneracion(404, "El trabajo no existe.");
  return vistaDeFila(fila);
}
