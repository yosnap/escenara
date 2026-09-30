import { and, desc, eq, gt, inArray, isNotNull, ne, or, type SQL } from "drizzle-orm";
import {
  type DireccionElegidaConAcento,
  esAcento,
  esFormatoClip,
  esMomentoMicroaccion,
  esRegistroEstetico,
} from "@/lib/direccion";
import { ESTADOS_ACTIVOS, type TrabajoVista } from "@/lib/generacion";
import { etapaDeTrabajo } from "@/lib/produccion";
import { leerAjustes } from "../ajustes";
import { posicionEnCola, posicionesEnCola } from "../cola/toma";
import { db } from "../db/cliente";
import { type FilaMedio, type FilaTrabajo, generationJobs, media } from "../db/esquema";
import { aDto } from "../media/servicio";
import { ErrorGeneracion } from "./errores";

/**
 * Lectura de los trabajos de generación. Toda función recibe el `usuarioId` de la sesión ya comprobada y
 * filtra por él: un trabajo ajeno responde 404, igual que en la biblioteca (0.8.0), para no revelar
 * siquiera que existe.
 */

/** Trabajos que se muestran en el historial de una sola página. */
export const MAXIMO_HISTORIAL = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Identificadores que llegan del navegador (medios, trabajos, claves de confirmación). */
export const esUuidGeneracion = (valor: unknown): valor is string => typeof valor === "string" && UUID.test(valor);

/**
 * Un trabajo que nunca llegó a tener tarea en el proveedor deja de contar como «en curso» pasado un rato:
 * si no, un fallo al preparar el envío bloquearía el tope de trabajos simultáneos para siempre.
 */
export const MS_MAXIMO_PREPARANDO = 2 * 60_000;

/** Condición SQL de «sigue en marcha», sin contar los preparados que se quedaron sin tarea. */
export function condicionEnCurso(): SQL {
  const corte = new Date(Date.now() - MS_MAXIMO_PREPARANDO);
  const vivo = and(
    inArray(generationJobs.state, [...ESTADOS_ACTIVOS]),
    or(ne(generationJobs.state, "preparando"), isNotNull(generationJobs.taskId), gt(generationJobs.createdAt, corte)),
  );
  if (!vivo) throw new Error("Condición de trabajos en curso mal construida.");
  return vivo;
}

const iso = (f: Date | null) => (f ? f.toISOString() : null);

/**
 * Un trabajo `desconocido` con tarea en el proveedor necesita revisión a mano: quizá se ha pagado y su
 * reserva sigue retenida hasta que alguien lo resuelva.
 */
const necesitaRevision = (fila: FilaTrabajo) => fila.state === "desconocido";

/** Lo que escribió la persona, guardado aparte del prompt compuesto desde 0.16.0 (`input.escena`). */
function escenaDe(fila: FilaTrabajo): string {
  const escena = (fila.input as { escena?: unknown }).escena;
  return typeof escena === "string" ? escena : "";
}

/**
 * Trabajo tal como lo ve el navegador. `conPrompt` solo es `true` cuando el ajuste «Mostrar el prompt a los
 * usuarios» está encendido: de fábrica el prompt compuesto **no sale de aquí** (ADR-0022).
 */
export function vistaDe(
  fila: FilaTrabajo,
  medio: FilaMedio | null,
  posicion: number | null = null,
  conPrompt = false,
): TrabajoVista {
  const esTrend = (fila.input as { plantilla?: { kind?: unknown } }).plantilla?.kind === "trend";
  return {
    id: fila.id,
    tipo: fila.kind,
    proveedor: fila.provider,
    modelo: fila.model,
    estado: fila.state,
    // Etapa real por la que va, deducida del estado y de lo que se apuntó al pasar por ella. Nunca un porcentaje.
    etapa: etapaDeTrabajo(fila.state, fila.stage),
    estadoProveedor: fila.providerState,
    taskId: fila.taskId,
    escena: escenaDe(fila),
    ...(conPrompt && !esTrend ? { prompt: fila.prompt } : {}),
    creditosEstimados: fila.estimatedCredits,
    creditosConsumidos: fila.consumedCredits,
    error: fila.errorMessage,
    medioOrigenId: fila.sourceMediaId,
    personajeId: fila.characterId,
    medio: medio ? aDto(medio, { id: fila.userId, esAdmin: false }) : null,
    trabajoPadreId: fila.parentJobId,
    direccion: direccionGuardada(fila),
    derechosConfirmados: fila.rightsConfirmedAt !== null,
    motivoFallo: fila.failureReason,
    intentos: fila.attempts,
    intentosMaximos: fila.maxAttempts,
    posicionEnCola: posicion,
    limiteCreditos: fila.creditLimit,
    excesoCreditos: fila.excessCredits,
    enRevision: necesitaRevision(fila),
    creadoEn: fila.createdAt.toISOString(),
    enviadoEn: iso(fila.sentAt),
    ultimaConsulta: iso(fila.polledAt),
    terminadoEn: iso(fila.finishedAt),
  };
}

/**
 * La dirección elegida que quedó guardada con el trabajo (0.25.1). Son **claves**, no texto de prompt, así que
 * pueden salir hacia el navegador: es justo lo que el usuario eligió y leyó en los botones.
 *
 * Se vuelve a validar al leerla en lugar de confiar en lo guardado: la fila es JSON y un trabajo viejo no la
 * tiene. Si no encaja, se devuelve `null` y la pantalla ofrece dirigir desde cero.
 */
export function direccionGuardada(fila: FilaTrabajo): DireccionElegidaConAcento | null {
  const guardada = (fila.input as { direccionElegida?: unknown }).direccionElegida;
  if (!guardada || typeof guardada !== "object") return null;
  const c = guardada as Record<string, unknown>;
  if (!esFormatoClip(c.formatoClip) || !esMomentoMicroaccion(c.momentoMicroaccion)) return null;
  if (!esRegistroEstetico(c.registroEstetico) || !esAcento(c.acento)) return null;
  const clave = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    formatoClip: c.formatoClip,
    plano: clave(c.plano),
    angulo: clave(c.angulo),
    camara: clave(c.camara),
    microaccion: clave(c.microaccion),
    momentoMicroaccion: c.momentoMicroaccion,
    direccionVocal: clave(c.direccionVocal),
    optica: clave(c.optica),
    luz: clave(c.luz),
    localizacion: clave(c.localizacion),
    registroEstetico: c.registroEstetico,
    instruccionesExtra: clave(c.instruccionesExtra),
    modoExperto: c.modoExperto === true,
    descripcionExperta: clave(c.descripcionExperta),
    acento: c.acento,
  };
}

/** Fila del trabajo si es de quien pregunta. El admin tampoco ve los trabajos de otros. */
export async function filaPropia(usuarioId: string, id: string): Promise<FilaTrabajo> {
  const [fila] = await db()
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.id, id), eq(generationJobs.userId, usuarioId)))
    .limit(1);
  if (!fila) throw new ErrorGeneracion(404, "El trabajo no existe.");
  return fila;
}

/**
 * Personaje al que pertenece un medio por ser **resultado** de un trabajo hecho con él. Es lo que mantiene la
 * cadena: animar o reeditar un fotograma generado con un personaje sigue siendo ese personaje, y su borrado
 * tiene que alcanzarlo. `null` si el medio no salió de ningún trabajo con personaje.
 */
export async function personajeDeLaCadena(usuarioId: string, medioId: string): Promise<string | null> {
  const [fila] = await db()
    .select({ personajeId: generationJobs.characterId })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.userId, usuarioId),
        eq(generationJobs.resultMediaId, medioId),
        isNotNull(generationJobs.characterId),
      ),
    )
    .limit(1);
  return fila?.personajeId ?? null;
}

/**
 * De los medios indicados, cuáles son **resultado de un trabajo** del usuario: es decir, cuáles son imágenes
 * que generó Escenara y no fotos que hizo nadie. Se usa al añadir referencias a un personaje, para que una
 * imagen generada no pueda entrar como «foto original» aunque se elija desde la biblioteca.
 */
export async function trabajosQueGeneraron(usuarioId: string, medioIds: string[]): Promise<Map<string, FilaTrabajo>> {
  if (medioIds.length === 0) return new Map();
  const filas = await db()
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.userId, usuarioId),
        inArray(generationJobs.resultMediaId, [...new Set(medioIds)]),
        isNotNull(generationJobs.resultMediaId),
      ),
    );
  return new Map(filas.flatMap((f) => (f.resultMediaId ? [[f.resultMediaId, f] as [string, FilaTrabajo]] : [])));
}

/** Medio resultante de un trabajo, si ya está guardado. */
async function medioDe(fila: FilaTrabajo): Promise<FilaMedio | null> {
  if (!fila.resultMediaId) return null;
  const [medioFila] = await db().select().from(media).where(eq(media.id, fila.resultMediaId)).limit(1);
  return medioFila ?? null;
}

export async function vistaDeFila(fila: FilaTrabajo): Promise<TrabajoVista> {
  const [medio, posicion, ajustes] = await Promise.all([medioDe(fila), posicionEnCola(fila), leerAjustes()]);
  return vistaDe(fila, medio, posicion, ajustes.mostrarPromptAlUsuario);
}

export async function obtenerTrabajo(usuarioId: string, id: string): Promise<TrabajoVista> {
  return vistaDeFila(await filaPropia(usuarioId, id));
}

/** Historial del usuario, de lo más reciente a lo más antiguo, con su medio resultante si lo hay. */
export async function listarTrabajos(usuarioId: string, limite = MAXIMO_HISTORIAL): Promise<TrabajoVista[]> {
  const filas = await db()
    .select()
    .from(generationJobs)
    .where(eq(generationJobs.userId, usuarioId))
    .orderBy(desc(generationJobs.createdAt))
    .limit(limite);
  const ids = filas.map((f) => f.resultMediaId).filter((id): id is string => id !== null);
  const medios = ids.length > 0 ? await db().select().from(media).where(inArray(media.id, ids)) : [];
  const porId = new Map(medios.map((m) => [m.id, m]));
  // Los puestos de la cola se calculan una sola vez para toda la lista, no uno por fila.
  const puestos = filas.some((f) => f.state === "en_cola") ? await posicionesEnCola() : new Map<string, number>();
  const { mostrarPromptAlUsuario } = await leerAjustes();
  return filas.map((f) =>
    vistaDe(
      f,
      f.resultMediaId ? (porId.get(f.resultMediaId) ?? null) : null,
      puestos.get(f.id) ?? null,
      mostrarPromptAlUsuario,
    ),
  );
}

/** Cuántos trabajos del usuario siguen en marcha (informativo; el tope se comprueba al reservar). */
export async function trabajosEnCurso(usuarioId: string): Promise<number> {
  const filas = await db()
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(and(eq(generationJobs.userId, usuarioId), condicionEnCurso()));
  return filas.length;
}
