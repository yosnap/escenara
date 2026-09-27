import { and, desc, eq, gt, inArray, isNotNull, ne, or, type SQL } from "drizzle-orm";
import { ESTADOS_ACTIVOS, type TrabajoVista } from "@/lib/generacion";
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

export function vistaDe(fila: FilaTrabajo, medio: FilaMedio | null): TrabajoVista {
  return {
    id: fila.id,
    tipo: fila.kind,
    proveedor: fila.provider as "kie",
    modelo: fila.model,
    estado: fila.state,
    estadoProveedor: fila.providerState,
    taskId: fila.taskId,
    prompt: fila.prompt,
    creditosEstimados: fila.estimatedCredits,
    creditosConsumidos: fila.consumedCredits,
    error: fila.errorMessage,
    medioOrigenId: fila.sourceMediaId,
    medio: medio ? aDto(medio, { id: fila.userId, esAdmin: false }) : null,
    trabajoPadreId: fila.parentJobId,
    derechosConfirmados: fila.rightsConfirmedAt !== null,
    creadoEn: fila.createdAt.toISOString(),
    enviadoEn: iso(fila.sentAt),
    ultimaConsulta: iso(fila.polledAt),
    terminadoEn: iso(fila.finishedAt),
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

/** Medio resultante de un trabajo, si ya está guardado. */
async function medioDe(fila: FilaTrabajo): Promise<FilaMedio | null> {
  if (!fila.resultMediaId) return null;
  const [medioFila] = await db().select().from(media).where(eq(media.id, fila.resultMediaId)).limit(1);
  return medioFila ?? null;
}

export async function vistaDeFila(fila: FilaTrabajo): Promise<TrabajoVista> {
  return vistaDe(fila, await medioDe(fila));
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
  return filas.map((f) => vistaDe(f, f.resultMediaId ? (porId.get(f.resultMediaId) ?? null) : null));
}

/** Cuántos trabajos del usuario siguen en marcha (informativo; el tope se comprueba al reservar). */
export async function trabajosEnCurso(usuarioId: string): Promise<number> {
  const filas = await db()
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(and(eq(generationJobs.userId, usuarioId), condicionEnCurso()));
  return filas.length;
}
