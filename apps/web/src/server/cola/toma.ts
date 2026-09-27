import { and, asc, desc, eq, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "../db/cliente";
import { type FilaTrabajo, generationJobs } from "../db/esquema";
import { cerrarTrabajoYGasto } from "../presupuesto/reserva";

/**
 * Toma de trabajos de la cola y recuperación de los que se queda un worker caído (ADR-0003).
 *
 * La toma es un solo `UPDATE … FROM (SELECT … FOR UPDATE SKIP LOCKED)`: atómico, así que dos workers nunca
 * se llevan el mismo trabajo (el segundo salta las filas que el primero tiene bloqueadas) y no hace falta
 * ningún cerrojo fuera de la base de datos.
 *
 * Lo que hace segura la caducidad de la toma es **el estado, no el reloj**:
 *
 * - `preparando` = todavía no se ha llamado al proveedor. Si la toma caduca, no puede haber tarea creada, así
 *   que el trabajo se **cierra** soltando su reserva (no ha costado nada). Nunca vuelve a la cola: volver a
 *   la cola es lo que permitiría que dos workers enviaran lo mismo.
 * - `enviando` = se está llamando (o se ha llamado ya) al proveedor. Si la toma caduca en ese estado,
 *   **puede haber una tarea cobrada** aunque no se haya guardado su identificador: el trabajo pasa a
 *   `desconocido` con la reserva **retenida**, y solo una persona decide qué hacer.
 * - con `task_id` ya guardado, la tarea existe: pasa a `enviado` y a partir de ahí solo se **consulta**.
 */

/** Motivo de fallo tal como lo acepta la columna del trabajo. */
type MotivoFalloTrabajo = NonNullable<FilaTrabajo["failureReason"]>;

/** Cuánto vale una toma. Amplio: subir la referencia y crear la tarea puede tardar. */
export const MS_TOMA = 3 * 60_000;

/** Espera antes de reintentar un trabajo que falló sin coste; sube con cada intento. */
export const MS_ESPERA_REINTENTO = 15_000;

/** Trabajos que un worker se lleva por pasada. */
export const MAXIMO_POR_TOMA = 5;

const MENSAJE_ENVIANDO_ABANDONADO =
  "El envío al proveedor se interrumpió sin saber si aceptó el trabajo, así que no se reenviará: revisa el historial de tu cuenta en el proveedor antes de pedirlo otra vez.";

/**
 * Toma hasta `limite` trabajos de la cola para este worker y los pasa a `preparando`. Devuelve las filas ya
 * tomadas, con `attempts` incrementado.
 */
export async function tomarTrabajos(workerId: string, limite = MAXIMO_POR_TOMA): Promise<FilaTrabajo[]> {
  const hasta = new Date(Date.now() + MS_TOMA);
  // El `UPDATE` con `SKIP LOCKED` es lo que reparte: devuelve solo los identificadores porque una consulta
  // en SQL crudo no pasa por el mapeo de columnas de Drizzle.
  const tomadas = await db().execute<{ id: string }>(sql`
    with candidatos as (
      select id from generation_jobs
      where state = 'en_cola'
        and available_at <= now()
        and (locked_until is null or locked_until < now())
        and attempts < max_attempts
      order by priority desc, created_at asc
      for update skip locked
      limit ${limite}
    )
    update generation_jobs j
    set locked_by = ${workerId},
        locked_until = ${hasta},
        state = 'preparando',
        attempts = j.attempts + 1
    from candidatos c
    where j.id = c.id
    returning j.id
  `);
  const ids = (tomadas as unknown as { id: string }[]).map((f) => f.id);
  if (ids.length === 0) return [];
  return db().select().from(generationJobs).where(inArray(generationJobs.id, ids));
}

/**
 * Renueva la toma y marca la fila como «llamada al proveedor en curso» (`enviando`) **antes** de llamar.
 * Devuelve `false` si la fila ya no es de este worker o ya no está `preparando`: en ese caso **no se llama al
 * proveedor**, porque otro worker la ha tomado.
 *
 * Las dos cosas van en el mismo `UPDATE` a propósito: si se renovara la toma y se marcara el estado en dos
 * pasos, entre uno y otro cabría exactamente la carrera que esto evita.
 */
export async function marcarEnviando(id: string, workerId: string): Promise<boolean> {
  const marcadas = await db()
    .update(generationJobs)
    .set({ state: "enviando", lockedUntil: new Date(Date.now() + MS_TOMA) })
    .where(
      and(
        eq(generationJobs.id, id),
        eq(generationJobs.lockedBy, workerId),
        eq(generationJobs.state, "preparando"),
        isNull(generationJobs.taskId),
      ),
    )
    .returning({ id: generationJobs.id });
  return marcadas.length > 0;
}

/**
 * Renueva la toma de un trabajo que se está preparando. Subir varias referencias al proveedor puede tardar
 * más que la toma, y una toma caducada mientras se prepara deja que otro worker se lleve el trabajo y lo
 * prepare otra vez. Devuelve `false` si la fila ya no es de este worker: entonces hay que abandonar.
 */
export async function renovarToma(id: string, workerId: string): Promise<boolean> {
  const renovadas = await db()
    .update(generationJobs)
    .set({ lockedUntil: new Date(Date.now() + MS_TOMA) })
    .where(
      and(
        eq(generationJobs.id, id),
        eq(generationJobs.lockedBy, workerId),
        eq(generationJobs.state, "preparando"),
        isNull(generationJobs.taskId),
      ),
    )
    .returning({ id: generationJobs.id });
  return renovadas.length > 0;
}

/**
 * Suelta la toma de un trabajo que este worker ya ha terminado de atender.
 *
 * Dos condiciones, y las dos son de dinero:
 *
 * - solo suelta lo que sigue siendo suyo: si otro worker ya lo tiene, no se le quita la toma;
 * - **nunca suelta una fila `enviando`**. Una fila que se quedó en `enviando` es una que llamó al proveedor y
 *   no consiguió guardar el resultado; quitarle la toma la dejaría con `locked_until` a nulo y, como la
 *   recuperación busca tomas caducadas, se quedaría atrapada en `enviando` para siempre: ni cerrada, ni
 *   visible en revisión, con su reserva apartada y sin que nadie mirase esa tarea ya pagada. Se deja con la
 *   toma puesta a propósito, para que caduque y la recoja `recuperarHuerfanos`.
 */
export async function soltarToma(id: string, workerId: string): Promise<void> {
  await db()
    .update(generationJobs)
    .set({ lockedBy: null, lockedUntil: null })
    .where(and(eq(generationJobs.id, id), eq(generationJobs.lockedBy, workerId), ne(generationJobs.state, "enviando")));
}

/**
 * Devuelve a la cola un trabajo que falló **antes de llamar al proveedor**, con espera creciente. Si ya no le
 * quedan intentos, se cierra como fallido y se suelta la reserva: no ha costado nada.
 *
 * Solo se puede llamar con la fila en `preparando`: la condición va en el propio `UPDATE`, así que si el
 * trabajo ya ha pasado a `enviando` (o tiene tarea) no vuelve a la cola ni por error de programación.
 */
export async function reintentar(fila: FilaTrabajo, mensaje: string, motivo: MotivoFalloTrabajo): Promise<boolean> {
  const sigueSinLlamar = and(
    eq(generationJobs.id, fila.id),
    eq(generationJobs.state, "preparando"),
    isNull(generationJobs.taskId),
  );
  if (fila.attempts >= fila.maxAttempts) {
    await cerrarTrabajoYGasto(
      fila.id,
      and(eq(generationJobs.state, "preparando"), isNull(generationJobs.taskId)),
      {
        state: "fallido",
        failureReason: motivo,
        lockedBy: null,
        lockedUntil: null,
        errorMessage: `${mensaje} Se ha intentado ${fila.attempts} veces y no se ha vuelto a enviar.`,
        finishedAt: new Date(),
      },
      0,
      "El trabajo no ha llegado a enviarse al proveedor: no ha costado nada.",
    );
    return false;
  }
  await db()
    .update(generationJobs)
    .set({
      state: "en_cola",
      failureReason: motivo,
      lockedBy: null,
      lockedUntil: null,
      errorMessage: mensaje,
      availableAt: new Date(Date.now() + MS_ESPERA_REINTENTO * fila.attempts),
    })
    .where(sigueSinLlamar);
  return true;
}

export interface Recuperados {
  /** Trabajos que ya tenían tarea y vuelven a `enviado` para seguir consultándose, sin reenviar nada. */
  aSeguimiento: number;
  /** Trabajos abandonados en `preparando`: no se había llamado al proveedor, se cierran sin coste. */
  cerrados: number;
  /** Trabajos abandonados en `enviando`: pueden estar cobrados, quedan `desconocido` con la reserva retenida. */
  enRevision: number;
}

/**
 * Recupera los trabajos cuya toma ha caducado (el worker que los tenía se ha caído). Ninguna rama devuelve
 * un trabajo a la cola de envío: ver la explicación de estados en la cabecera de este fichero.
 */
export async function recuperarHuerfanos(): Promise<Recuperados> {
  // «Sin toma viva» incluye la toma a nulo, no solo la caducada: una fila a la que alguien le quitó la toma
  // estando en `enviando` también hay que recogerla, o se quedaría atrapada ahí para siempre.
  const sinTomaViva = or(isNull(generationJobs.lockedUntil), lt(generationJobs.lockedUntil, new Date()));
  const abandonada = and(inArray(generationJobs.state, ["preparando", "enviando"]), sinTomaViva);

  // 1. Con tarea guardada, en cualquiera de los dos estados: la tarea existe, solo queda consultarla.
  const aSeguimiento = await db()
    .update(generationJobs)
    .set({ state: "enviado", lockedBy: null, lockedUntil: null })
    .where(and(abandonada, isNotNull(generationJobs.taskId)))
    .returning({ id: generationJobs.id });

  // 2. `enviando` sin tarea guardada: puede haber una tarea cobrada que no llegamos a apuntar. La reserva se
  // queda retenida y el trabajo aparece en `/admin/trabajos` para que alguien lo resuelva.
  const enRevision = await db()
    .update(generationJobs)
    .set({
      state: "desconocido",
      failureReason: "temporal",
      lockedBy: null,
      lockedUntil: null,
      errorMessage: MENSAJE_ENVIANDO_ABANDONADO,
      finishedAt: new Date(),
    })
    .where(and(abandonada, isNull(generationJobs.taskId), eq(generationJobs.state, "enviando")))
    .returning({ id: generationJobs.id });

  // 3. `preparando` sin tarea: no se llamó al proveedor, así que no ha costado nada.
  const abandonados = await db()
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(
      and(
        inArray(generationJobs.state, ["preparando"]),
        isNotNull(generationJobs.lockedUntil),
        lt(generationJobs.lockedUntil, new Date()),
        isNull(generationJobs.taskId),
      ),
    )
    .limit(50);
  let cerrados = 0;
  for (const { id } of abandonados) {
    if (await cerrarPreparacionAbandonada(id)) cerrados++;
  }

  return { aSeguimiento: aSeguimiento.length, cerrados, enRevision: enRevision.length };
}

/**
 * Cierra un trabajo que se quedó `preparando` sin llegar a llamar al proveedor: estado terminal y liberación de
 * la reserva en la misma transacción. Es el camino **único** para este caso, y lo usan tanto la recuperación de
 * huérfanos como el barrido de preparaciones viejas: antes había dos sitios que lo resolvían de formas
 * distintas (uno lo dejaba `desconocido`, retenedo la reserva sin motivo).
 */
export async function cerrarPreparacionAbandonada(id: string): Promise<boolean> {
  const cerrada = await cerrarTrabajoYGasto(
    id,
    and(
      eq(generationJobs.state, "preparando"),
      isNull(generationJobs.taskId),
      // Nunca se toca un trabajo con toma viva: ese lo está enviando un worker ahora mismo.
      or(isNull(generationJobs.lockedUntil), lt(generationJobs.lockedUntil, new Date())),
    ),
    {
      state: "fallido",
      failureReason: "interno",
      lockedBy: null,
      lockedUntil: null,
      errorMessage:
        "El envío se interrumpió antes de llegar al proveedor y no se ha vuelto a enviar: no ha costado nada. Vuelve a pedirlo cuando quieras.",
      finishedAt: new Date(),
    },
    0,
    "El trabajo no ha llegado a enviarse al proveedor: no ha costado nada.",
  );
  return cerrada !== null;
}

/** Puestos de toda la cola, para pintar una lista sin una consulta por fila. */
export async function posicionesEnCola(): Promise<Map<string, number>> {
  // Mismo orden que la toma: van delante los de más prioridad y, a igualdad, los más antiguos.
  const filas = await db()
    .select({ id: generationJobs.id })
    .from(generationJobs)
    .where(eq(generationJobs.state, "en_cola"))
    .orderBy(desc(generationJobs.priority), asc(generationJobs.createdAt))
    .limit(500);
  return new Map(filas.map((f, i) => [f.id, i + 1]));
}

/**
 * Puesto de un trabajo concreto (1 = el siguiente en salir), o `null` si ya no está en cola. Se cuenta con un
 * `count(*)` en la base de datos: no se lee la cola entera para saber un solo puesto.
 */
export async function posicionEnCola(
  fila: Pick<FilaTrabajo, "id" | "state" | "priority" | "createdAt">,
): Promise<number | null> {
  if (fila.state !== "en_cola") return null;
  const delante = or(
    sql`${generationJobs.priority} > ${fila.priority}`,
    and(eq(generationJobs.priority, fila.priority), sql`${generationJobs.createdAt} <= ${fila.createdAt}`),
  );
  const [conteo] = await db()
    .select({ total: sql<number>`count(*)::int` })
    .from(generationJobs)
    .where(and(eq(generationJobs.state, "en_cola"), delante));
  return Math.max(1, conteo?.total ?? 1);
}
