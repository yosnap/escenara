import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { db, type Ejecutor } from "../db/cliente";
import { comparisons, type FilaTrabajo, generationJobs } from "../db/esquema";

/**
 * Cómo se reconoce un trabajo que es **una alternativa de una comparativa A/B**: su clave de idempotencia está entre
 * las alternativas de una comparativa de su escena. La comparativa se guarda **antes** de encolar, así que cuando el
 * worker cierra el trabajo la marca ya existe.
 *
 * Una alternativa no es el clip de la escena: al terminar no pasa a ser su clip, al fallar no escribe su motivo de fallo
 * y no cuenta como el último clip de la producción. El usuario la convierte en el clip de la escena al elegirla ganadora.
 */

/** Condición SQL: el trabajo `j` (alias de `generation_jobs`) es una alternativa de una comparativa. */
export const condicionDeAlternativa = (j: string): SQL =>
  sql.raw(`exists (select 1 from comparisons c where c.scene_id = ${j}.scene_id and c.user_id = ${j}.user_id
    and c.alternatives @> jsonb_build_array(jsonb_build_object('clave', ${j}.idempotency_key)))`);

/** `true` si el trabajo es una alternativa de una comparativa de su escena. */
export async function esAlternativaDeComparativa(
  fila: Pick<FilaTrabajo, "sceneId" | "userId" | "idempotencyKey">,
): Promise<boolean> {
  if (!fila.sceneId || !fila.idempotencyKey) return false;
  const [marca] = await db()
    .select({ id: comparisons.id })
    .from(comparisons)
    .where(
      and(
        eq(comparisons.sceneId, fila.sceneId),
        eq(comparisons.userId, fila.userId),
        sql`${comparisons.alternatives} @> ${JSON.stringify([{ clave: fila.idempotencyKey }])}::text::jsonb`,
      ),
    )
    .limit(1);
  return marca !== undefined;
}

/** Identificadores de los trabajos de esas escenas que son alternativas de una comparativa. */
export async function alternativasDeEscenas(escenaIds: readonly string[]): Promise<Set<string>> {
  if (escenaIds.length === 0) return new Set();
  const filas = await db()
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(and(inArray(generationJobs.sceneId, [...escenaIds]), condicionDeAlternativa('"generation_jobs"')));
  return new Set(filas.map((f) => f.id));
}

/**
 * Ejecuciones confirmadas de la comparativa a la que pertenece este envío, si es una de sus alternativas: la clave
 * **y el modelo** tienen que ser los que se guardaron al confirmarla. `null` si no es una alternativa.
 *
 * Lo usa la transacción que encola (`cola/encolar.ts`) para admitir, **solo** en ese caso, los clips que el usuario
 * confirmó expresamente en número y coste aunque la escena ya tenga el suyo.
 */
export async function ejecucionesDeLaComparativa(
  tx: Ejecutor,
  datos: { usuarioId: string; escenaId: string; clave: string; modelo: string },
): Promise<{ ejecuciones: number; claves: string[] } | null> {
  const [fila] = await tx
    .select({ ejecuciones: comparisons.plannedRuns, alternativas: comparisons.alternatives })
    .from(comparisons)
    .where(
      and(
        eq(comparisons.sceneId, datos.escenaId),
        eq(comparisons.userId, datos.usuarioId),
        sql`${comparisons.alternatives} @> ${JSON.stringify([{ clave: datos.clave, modelo: datos.modelo }])}::text::jsonb`,
      ),
    )
    .limit(1);
  return fila ? { ejecuciones: fila.ejecuciones, claves: fila.alternativas.map((a) => a.clave) } : null;
}
