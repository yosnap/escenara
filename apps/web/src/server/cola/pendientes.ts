import { and, asc, eq, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/cliente";
import { generationJobs } from "../db/esquema";
import { MS_MINIMO_ENTRE_CONSULTAS } from "../generacion/seguimiento";
import { MS_MAXIMO_PREPARANDO } from "../generacion/trabajos";

/**
 * Qué trabajos toca mirar en cada pasada del worker. No se envía nada desde aquí: esto solo elige a quién
 * hay que preguntar por su `task_id`.
 *
 * Orden: primero los que llevan más tiempo sin consultarse, con los que **nunca** se han consultado delante
 * (`nulls first`), para que un trabajo recién enviado no espere detrás de otros atascados.
 */

/** Trabajos que se consultan por pasada: lotes pequeños para no encadenar decenas de peticiones. */
export const MAXIMO_POR_PASADA = 5;

/**
 * Techo de edad de un trabajo en marcha. Lo medido para `veo3_lite` son unos 2,5 minutos, así que media
 * hora es un margen amplísimo: pasado eso, el trabajo se queda `desconocido` y sale del automático, con su
 * reserva retenida hasta que alguien lo resuelva. El usuario siempre puede volver a consultarlo a mano; lo
 * que no se hace nunca es reenviarlo.
 */
export const MS_MAXIMO_EN_CURSO = 30 * 60_000;

export interface Pendiente {
  id: string;
  usuarioId: string;
}

export async function pendientesDeConsulta(limite = MAXIMO_POR_PASADA): Promise<Pendiente[]> {
  const corteConsulta = new Date(Date.now() - MS_MINIMO_ENTRE_CONSULTAS);
  const enMarcha = and(
    inArray(generationJobs.state, ["enviado", "en_curso"]),
    isNotNull(generationJobs.taskId),
    or(isNull(generationJobs.polledAt), lt(generationJobs.polledAt, corteConsulta)),
  );
  return db()
    .select({ id: generationJobs.id, usuarioId: generationJobs.userId })
    .from(generationJobs)
    .where(enMarcha)
    .orderBy(sql`${generationJobs.polledAt} asc nulls first`, asc(generationJobs.createdAt))
    .limit(limite);
}

/**
 * Trabajos que se quedaron `preparando` sin llegar a tener tarea y **sin ningún worker detrás**: hay que
 * cerrarlos, y para eso no se llama a nadie. No están en {@link pendientesDeConsulta} porque no hay nada que
 * consultarle al proveedor; los cierra `cerrarPreparacionAbandonada`, que es el único camino para este caso.
 *
 * Los que sí tienen toma viva no se tocan: los está enviando un worker ahora mismo.
 */
export async function preparacionesAbandonadas(limite = MAXIMO_POR_PASADA): Promise<string[]> {
  const corte = new Date(Date.now() - MS_MAXIMO_PREPARANDO);
  const filas = await db()
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.state, "preparando"),
        isNull(generationJobs.taskId),
        or(isNull(generationJobs.lockedUntil), lt(generationJobs.lockedUntil, new Date())),
        lt(generationJobs.createdAt, corte),
      ),
    )
    .orderBy(asc(generationJobs.createdAt))
    .limit(limite);
  return filas.map((f) => f.id);
}
