import { and, eq, sql } from "drizzle-orm";
import { PROVEEDORES_PUBLICOS, type Proveedor } from "@/lib/boveda";
import type { ModeloVista } from "@/lib/catalogo";
import { CLIP, type TipoTrabajo, type TrabajoVista } from "@/lib/generacion";
import { db } from "../db/cliente";
import { type FilaMedio, type FilaTrabajo, generationJobs } from "../db/esquema";
import { referenciaCompatible } from "../media/conversion-referencia";
import type { Actor } from "../media/servicio";
import { type Adaptador, ErrorProveedor } from "../proveedores/contrato";
import {
  archivoDe,
  exigirAvisoUmbral,
  exigirClaveIdempotencia,
  exigirConfirmacion,
  exigirCredencial,
  exigirCuota,
  exigirDerechos,
  exigirRitmo,
  exigirSaldo,
  imagenPropia,
  limpiarDialogo,
  limpiarPrompt,
  proveedorDeCredencial,
} from "./comprobaciones";
import { ErrorGeneracion } from "./errores";
import { olvidarSaldo } from "./estimacion";
import { HERRAMIENTAS, type Herramientas } from "./herramientas";
import { type EleccionDeTrabajo, elegirParaTipo, exigirSelloVigente } from "./precios";
import { condicionEnCurso, esUuidGeneracion, filaPropia, vistaDeFila } from "./trabajos";

/**
 * Envío de trabajos al proveedor con la clave del propio usuario (RF01). Desde la 0.11.0 el proveedor no se
 * nombra aquí: el modelo se elige por capacidad en el catálogo y se habla con él a través de su adaptador
 * (ADR-0015). Reglas duras, iguales que en la 0.10.0:
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
  /** Modelo elegido en el catálogo; sin él se usa el predeterminado de la capacidad. */
  modelo?: string;
  /** Sello del precio con el que se hizo la estimación: si ha cambiado, se rechaza. */
  selloEstimacion?: string;
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

/**
 * Lo que se guarda como entrada del trabajo: `prompt` es lo que escribió la persona y `parametros` lo que
 * se le envió al proveedor (incluido el prompt ya montado, útil para entender un resultado raro). Nunca
 * incluye las URL temporales del proveedor ni ningún secreto: cada modelo las recibe por un campo distinto
 * (`image_urls`, `input_urls`, `image_url`) y se quitan todos.
 */
function entradaGuardada(
  adaptador: Adaptador,
  prompt: string,
  referencias: string[],
  parametros: Record<string, unknown>,
) {
  const resto = { ...parametros };
  for (const campo of adaptador.camposDeUrl) delete resto[campo];
  return { prompt, referencias, parametros: resto };
}

/** Modelo elegido, su adaptador y sus créditos ya comprobados contra lo que confirmó el usuario. */
async function eleccionConfirmada(tipo: TipoTrabajo, peticion: Confirmacion): Promise<EleccionDeTrabajo> {
  const eleccion = await elegirParaTipo(tipo, peticion.modelo);
  // Quien elige modelo tiene que devolver el sello del precio que vio; sin modelo se usa el predeterminado.
  exigirSelloVigente(peticion.selloEstimacion, eleccion.precio.sello, Boolean(peticion.modelo));
  return eleccion;
}

export async function crearFotograma(
  actor: Actor,
  peticion: PeticionFotograma,
  h: Herramientas = HERRAMIENTAS,
): Promise<Envio> {
  const prompt = limpiarPrompt(peticion.prompt);
  exigirDerechos(peticion.derechos);
  const claveIdempotencia = exigirClaveIdempotencia(peticion.claveIdempotencia);
  const { modelo, adaptador, precio } = await eleccionConfirmada("fotograma", peticion);
  const creditos = Math.ceil(precio.creditos);
  exigirConfirmacion(peticion.creditosConfirmados, creditos);
  await exigirAvisoUmbral(creditos, peticion.avisoUmbralAceptado);
  const yaHecho = await trabajoDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaHecho) return { trabajo: yaHecho, nueva: false };
  const proveedor = proveedorDeCredencial(modelo);
  const clave = await exigirCredencial(actor.id, proveedor);
  const origen = await imagenPropia(actor.id, peticion.medioId);
  await exigirCuota(actor, "fotograma");
  await exigirSaldo(actor.id, creditos, h.buscar, proveedor);
  await exigirRitmo(actor.id);

  const parametros = adaptador.montarEntrada(modelo, { escena: prompt, dialogo: "", urls: [] });
  const reserva = await reservar(actor.id, claveIdempotencia, {
    userId: actor.id,
    kind: "fotograma",
    provider: proveedor,
    model: modelo.modelo,
    prompt,
    input: entradaGuardada(adaptador, prompt, [origen.id], parametros),
    sourceMediaId: origen.id,
    estimatedCredits: creditos,
  });
  if (!reserva.nueva) return { trabajo: await vistaDeFila(reserva.fila), nueva: false };

  const trabajo = await enviar(reserva.fila, { adaptador, clave, video: false }, h, async () => {
    const url = await subirReferenciaDe(adaptador, clave, origen, modelo, h);
    return adaptador.montarEntrada(modelo, { escena: prompt, dialogo: "", urls: [url] });
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
  const { modelo, adaptador, precio } = await eleccionConfirmada("animacion", peticion);
  const creditos = Math.ceil(precio.creditos);
  exigirConfirmacion(peticion.creditosConfirmados, creditos);
  await exigirAvisoUmbral(creditos, peticion.avisoUmbralAceptado);
  const yaHecho = await trabajoDeLaConfirmacion(actor.id, claveIdempotencia);
  if (yaHecho) return { trabajo: yaHecho, nueva: false };
  const proveedor = proveedorDeCredencial(modelo);
  const clave = await exigirCredencial(actor.id, proveedor);

  if (!esUuidGeneracion(peticion.trabajoPadreId)) throw new ErrorGeneracion(404, "El trabajo no existe.");
  const padre = await filaPropia(actor.id, peticion.trabajoPadreId);
  if (padre.kind !== "fotograma") throw new ErrorGeneracion(400, "Solo se animan fotogramas.");
  if (padre.state !== "listo" || !padre.resultMediaId) {
    throw new ErrorGeneracion(409, "Espera a que el fotograma esté listo y guardado antes de animarlo.");
  }
  const origen = await imagenPropia(actor.id, padre.resultMediaId);
  await exigirCuota(actor, "animacion");
  await exigirSaldo(actor.id, creditos, h.buscar, proveedor);
  await exigirRitmo(actor.id);

  // Un modelo sin voz no recibe nunca lo que dice el personaje (Hailuo 2.3 no tiene audio).
  const dialogo = modelo.conVoz ? limpiarDialogo(peticion.dialogo) : "";
  const segundos = modelo.parametros.duraciones[0] ?? CLIP.segundos;
  const parametros = adaptador.montarEntrada(modelo, { escena: prompt, dialogo, urls: [] });
  const reserva = await reservar(actor.id, claveIdempotencia, {
    userId: actor.id,
    kind: "animacion",
    provider: proveedor,
    model: modelo.modelo,
    prompt,
    input: { ...entradaGuardada(adaptador, prompt, [origen.id], { ...parametros, segundos }), dialogo },
    sourceMediaId: origen.id,
    parentJobId: padre.id,
    estimatedCredits: creditos,
  });
  if (!reserva.nueva) return { trabajo: await vistaDeFila(reserva.fila), nueva: false };

  const trabajo = await enviar(reserva.fila, { adaptador, clave, video: true }, h, async () => {
    const url = await subirReferenciaDe(adaptador, clave, origen, modelo, h);
    return adaptador.montarEntrada(modelo, { escena: prompt, dialogo, urls: [url] });
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
 * Sube la referencia al proveedor, convirtiéndola antes si ese modelo no acepta el formato en que la
 * guarda la biblioteca (Kling v3 turbo solo admite JPEG o PNG y los fotogramas son WebP).
 */
async function subirReferenciaDe(
  adaptador: Adaptador,
  clave: string,
  origen: FilaMedio,
  modelo: ModeloVista,
  h: Herramientas,
): Promise<string> {
  const archivo = await referenciaCompatible(await archivoDe(origen), modelo.parametros.formatosReferencia);
  return adaptador.subirReferencia({ clave, archivo, buscar: h.buscar });
}

/** Nombre público del proveedor que ejecuta un trabajo ya guardado (su columna ya es un proveedor válido). */
const proveedorDeFila = (fila: FilaTrabajo): Proveedor => fila.provider;

/** Contexto del envío: con quién se habla, con qué clave y si lo que se pide es un vídeo. */
interface Destino {
  adaptador: Adaptador;
  clave: string;
  video: boolean;
}

/**
 * Sube la referencia, crea la tarea y guarda su identificador. Si no se sabe si el proveedor la ha
 * aceptado, el trabajo queda `desconocido`: nunca se reintenta el envío desde aquí.
 */
async function enviar(
  fila: FilaTrabajo,
  destino: Destino,
  h: Herramientas,
  preparar: () => Promise<Record<string, unknown>>,
): Promise<TrabajoVista> {
  const { adaptador, clave, video } = destino;
  try {
    const entrada = await preparar();
    const peticion = { clave, modelo: fila.model, entrada, buscar: h.buscar };
    const taskId = video ? await adaptador.generarVideo(peticion) : await adaptador.generarImagen(peticion);
    // El saldo acaba de cambiar: la próxima estimación lo vuelve a preguntar.
    olvidarSaldo(fila.userId);
    return await actualizar(fila.id, { taskId, state: "enviado", sentAt: new Date() });
  } catch (error) {
    if (!(error instanceof ErrorProveedor)) {
      console.error(`[generacion] fallo al enviar el trabajo ${fila.id}: ${(error as Error).message}`);
      return actualizar(fila.id, {
        state: "fallido",
        errorMessage: "No se ha podido preparar el envío. Vuelve a intentarlo.",
        finishedAt: new Date(),
      });
    }
    // Un tiempo agotado o una red caída no dicen si la tarea existe ya en el proveedor.
    const sinRespuesta = error.sinRespuesta;
    return actualizar(fila.id, {
      state: sinRespuesta ? "desconocido" : "fallido",
      errorMessage: sinRespuesta
        ? `${error.message} No sabemos si el proveedor ha aceptado el trabajo, así que no se reenviará: revisa el historial de tu cuenta en ${PROVEEDORES_PUBLICOS[proveedorDeFila(fila)].nombre} antes de pedirlo otra vez.`
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
