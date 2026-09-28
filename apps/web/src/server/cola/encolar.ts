import { and, eq, isNotNull, lt, ne, sql } from "drizzle-orm";
import type { Proveedor } from "@/lib/boveda";
import { leerAjustes } from "../ajustes";
import { db, type Ejecutor } from "../db/cliente";
import { type FilaTrabajo, generationJobs, scenes } from "../db/esquema";
import { ErrorGeneracion } from "../generacion/errores";
import { condicionEnCurso } from "../generacion/trabajos";
import type { Acotacion } from "../presupuesto/acotar";
import { reservar } from "../presupuesto/reserva";

/**
 * Alta de un trabajo en la cola persistente (ADR-0003). Todo lo que tiene que pasar de una sola vez pasa en
 * **una sola transacción** con la fila del usuario bloqueada:
 *
 * 1. se comprueba que esta confirmación no esté ya encolada (clave de idempotencia);
 * 2. se comprueba el tope de trabajos simultáneos del usuario;
 * 3. produciendo una escena: el tope de escenas en vuelo, que no haya ya un trabajo de ese tipo en marcha para
 *    ella, que no tenga ya su clip, y el consumo del reintento autorizado si este envío repite lo que pudo
 *    cobrarse (0.19.0, ADR-0024);
 * 4. se reserva el coste máximo estimable en el registro de gasto;
 * 5. se da de alta el trabajo en `en_cola`.
 *
 * Así dos envíos a la vez ni se pasan del tope ni reservan el mismo saldo: el segundo espera el bloqueo y
 * ve lo que hizo el primero. Nada se envía aquí: eso lo hace el worker cuando toma el trabajo.
 */

/**
 * Campos del trabajo que decide quien encola; el estado y la reserva los pone esta función.
 *
 * `rightsConfirmedAt` queda fuera porque lo sella `insertar` con la fecha del alta. `referencesReviewedAt` sí
 * lo trae quien encola: solo existe cuando el trabajo lleva personaje.
 */
export type NuevoTrabajoEncolado = Omit<
  typeof generationJobs.$inferInsert,
  | "rightsConfirmedAt"
  | "idempotencyKey"
  | "state"
  | "reservationId"
  | "creditLimit"
  | "excessCredits"
  | "callbackTokenHash"
>;

export interface Encolado {
  fila: FilaTrabajo;
  /** `false` cuando esta confirmación ya estaba encolada: no se ha creado nada nuevo. */
  nueva: boolean;
}

export interface PeticionEncolado {
  usuarioId: string;
  claveIdempotencia: string;
  proveedor: Proveedor;
  /** Coste acotado o el motivo por el que no se puede acotar (PRD §6). */
  acotacion: Acotacion;
  valores: NuevoTrabajoEncolado;
  /** Sello del precio con el que se hizo la estimación, para auditar la reserva. */
  sello: string;
  /**
   * Coste **total del envío** (la generación más su traducción, si esta instalación traduce) con el que se mide
   * el tope por trabajo. Es la misma cifra que confirma el usuario y la misma que mide el motor de controles, así
   * que los dos controles no pueden discrepar. No cambia lo que se aparta: eso es `acotacion.creditos`.
   */
  creditosDelEnvio: number;
  /**
   * Escena que se está produciendo y el tope de escenas en vuelo del usuario (0.19.0). `null` en el camino
   * rápido de «Crear», que no pertenece a ninguna escena.
   *
   * Se comprueba **aquí y no antes** porque aquí ya está bloqueada la fila del usuario: contar fuera de esta
   * transacción dejaría que dos producciones simultáneas leyeran el mismo recuento y se pasaran las dos del tope.
   */
  escena: {
    escenaId: string;
    maximo: number;
    /**
     * `true` cuando este envío repite algo que pudo cobrarse, así que consume un reintento autorizado de la
     * escena (ADR-0024). El consumo va en esta misma transacción: así ni dos envíos simultáneos gastan el mismo
     * reintento, ni se pierde uno cuando el alta se deshace.
     */
    reintento: boolean;
    /**
     * Cuántos clips **espera** esta escena (0.28.0): 1 siempre, y **2** en un podcast, que son dos clips con un
     * personaje cada uno. Es lo único que permite que la segunda petición de un podcast no choque contra la regla
     * de «esta escena ya tiene un clip en marcha», que existe para que nadie pague dos veces el mismo plano.
     *
     * Ausente es 1, que es lo que era verdad para todo hasta esta versión.
     */
    clips?: number;
  } | null;
}

/**
 * Un solo trabajo de cada tipo por escena a la vez, y ni un clip más cuando la escena ya tiene el suyo.
 *
 * Va **dentro** de la transacción que reserva y da de alta, con la fila del usuario ya bloqueada, porque es lo que
 * impide que dos pestañas con dos confirmaciones distintas paguen dos clips de la misma escena: comprobarlo antes
 * dejaría pasar las dos, y el tope de escenas en vuelo no lo ve porque excluye la escena que se está encolando.
 */
async function exigirEscenaSinRepetir(tx: Ejecutor, peticion: PeticionEncolado): Promise<void> {
  const escenaId = peticion.escena?.escenaId;
  if (!escenaId) return;
  const tipo = peticion.valores.kind;
  const nombre = tipo === "animacion" ? "un clip" : tipo === "voz" ? "una pista de voz" : "un fotograma";
  // Un podcast son **dos** clips de la misma escena, y los dos son legítimos: lo que no puede haber es uno más.
  const esperados = tipo === "animacion" ? Math.max(1, peticion.escena?.clips ?? 1) : 1;
  const [{ total } = { total: 0 }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(generationJobs)
    .where(and(eq(generationJobs.sceneId, escenaId), eq(generationJobs.kind, tipo), condicionEnCurso()));
  if (total >= esperados) {
    throw new ErrorGeneracion(
      409,
      esperados === 1
        ? `Esta escena ya tiene ${nombre} en marcha. Espera a que termine o cancélalo antes de pedir otro: si no, se pagarían los dos.`
        : `Esta escena ya tiene sus ${esperados} clips en marcha. Espera a que terminen o cancélalos antes de pedir otros: si no, se pagarían todos.`,
    );
  }
  if (tipo !== "animacion") return;
  /**
   * En un podcast **no hay fotograma** del que partir (es una escena hablada de Omni), así que los clips ya
   * conseguidos se cuentan tal cual: los `listo` de esta escena. Sin esto, un intercambio ya terminado dejaría
   * pedir un tercer clip con otra confirmación.
   */
  if (esperados > 1) {
    const [{ hechos } = { hechos: 0 }] = await tx
      .select({ hechos: sql<number>`count(*)::int` })
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.sceneId, escenaId),
          eq(generationJobs.kind, "animacion"),
          eq(generationJobs.state, "listo"),
          isNotNull(generationJobs.resultMediaId),
        ),
      );
    if (hechos + total >= esperados) {
      throw new ErrorGeneracion(
        409,
        `Esta escena ya tiene sus ${esperados} clips. Regenérala si quieres otros distintos: pedirlos otra vez sería pagar dos veces lo mismo.`,
      );
    }
    return;
  }
  const [escena] = await tx
    .select({ clip: scenes.clipMediaId, fotogramaJobId: scenes.approvedFrameJobId })
    .from(scenes)
    .where(eq(scenes.id, escenaId))
    .limit(1);
  // También cuenta el clip que ya está `listo` y aún no se ha guardado en la escena: entre que termina y que se
  // registra, o si ese registro falla, la escena todavía no lo tiene, pero ya se ha pagado. Solo los posteriores
  // al fotograma aprobado: tras regenerar, el clip del fotograma anterior no cuenta.
  const [{ listos } = { listos: 0 }] = escena?.fotogramaJobId
    ? await tx
        .select({ listos: sql<number>`count(*)::int` })
        .from(generationJobs)
        .where(
          and(
            eq(generationJobs.sceneId, escenaId),
            eq(generationJobs.kind, "animacion"),
            eq(generationJobs.state, "listo"),
            isNotNull(generationJobs.resultMediaId),
            sql`${generationJobs.createdAt} > (select created_at from generation_jobs where id = ${escena.fotogramaJobId})`,
          ),
        )
    : [];
  if (escena?.clip || listos > 0) {
    throw new ErrorGeneracion(
      409,
      "Esta escena ya tiene su clip guardado. Regenérala si quieres otro distinto: animarla otra vez sería pagar dos veces lo mismo.",
    );
  }
}

/**
 * Consume un reintento autorizado de la escena. La condición va **dentro** del `UPDATE`, así que dos envíos a la
 * vez no pueden gastar el mismo, y al estar en esta transacción un alta que se deshaga lo devuelve sola.
 */
async function consumirReintento(tx: Ejecutor, escenaId: string): Promise<void> {
  const consumidos = await tx
    .update(scenes)
    .set({ retriesUsed: sql`${scenes.retriesUsed} + 1`, updatedAt: new Date() })
    .where(and(eq(scenes.id, escenaId), lt(scenes.retriesUsed, scenes.retryBudget)))
    .returning({ id: scenes.id });
  if (consumidos.length === 0) {
    throw new ErrorGeneracion(
      409,
      "Esta escena se ha quedado sin reintentos autorizados: autoriza más antes de volver a intentar algo que pudo cobrarse.",
    );
  }
}

/**
 * Escenas del usuario con algún trabajo en marcha, sin contar la que se está encolando: es el recuento con el que
 * se compara el tope de escenas en vuelo. Se cuentan **escenas distintas**, no trabajos: una escena con su
 * fotograma y su clip a la vez sigue siendo una escena.
 */
export async function escenasEnVueloDe(
  usuarioId: string,
  exceptoEscenaId: string,
  ejecutor: Ejecutor,
): Promise<number> {
  const [fila] = await ejecutor
    .select({ total: sql<number>`count(distinct ${generationJobs.sceneId})::int` })
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.userId, usuarioId),
        isNotNull(generationJobs.sceneId),
        ne(generationJobs.sceneId, exceptoEscenaId),
        condicionEnCurso(),
      ),
    );
  return fila?.total ?? 0;
}

export async function encolar(peticion: PeticionEncolado): Promise<Encolado> {
  const ajustes = await leerAjustes();
  try {
    return await db().transaction(async (tx) => {
      // Bloquea la fila del usuario: es lo que serializa dos envíos suyos a la vez.
      await tx.execute(sql`select 1 from users where id = ${peticion.usuarioId} for update`);
      const repetida = await filaDeLaConfirmacion(peticion.usuarioId, peticion.claveIdempotencia, tx);
      if (repetida) return { fila: repetida, nueva: false };

      const [{ total } = { total: 0 }] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(generationJobs)
        .where(and(eq(generationJobs.userId, peticion.usuarioId), condicionEnCurso()));
      if (total >= ajustes.trabajosSimultaneos) {
        throw new ErrorGeneracion(
          429,
          `Ya tienes ${total} trabajos en marcha, que es el máximo de esta instalación. Espera a que terminen antes de pedir otro.`,
        );
      }

      // Tope de escenas en vuelo (0.19.0): más estricto que el de trabajos, porque cada escena son dos.
      if (peticion.escena) {
        const enVuelo = await escenasEnVueloDe(peticion.usuarioId, peticion.escena.escenaId, tx);
        if (enVuelo >= peticion.escena.maximo) {
          throw new ErrorGeneracion(
            429,
            `Ya tienes ${enVuelo} ${enVuelo === 1 ? "escena" : "escenas"} produciéndose y esta instalación permite ${peticion.escena.maximo} a la vez. Espera a que termine alguna: el resto del proyecto sigue esperando y no se pierde nada.`,
          );
        }
        await exigirEscenaSinRepetir(tx, peticion);
        if (peticion.escena.reintento) await consumirReintento(tx, peticion.escena.escenaId);
      }

      // Sin coste acotado no se reserva nada y el trabajo espera un límite del usuario: así no puede
      // salir hacia el proveedor con el gasto abierto.
      if (!peticion.acotacion.acotado) {
        return { fila: await insertar(tx, peticion, "esperando_limite", null), nueva: true };
      }

      const fila = await insertar(tx, peticion, "en_cola", null);
      const apunte = await reservar(
        tx,
        {
          usuarioId: peticion.usuarioId,
          trabajoId: fila.id,
          proveedor: peticion.proveedor,
          modelo: fila.model,
          creditos: peticion.acotacion.creditos,
          creditosDelEnvio: peticion.creditosDelEnvio,
          sello: peticion.sello,
        },
        ajustes,
      );
      const [conReserva] = await tx
        .update(generationJobs)
        .set({ reservationId: apunte.id })
        .where(eq(generationJobs.id, fila.id))
        .returning();
      return { fila: conReserva ?? fila, nueva: true };
    });
  } catch (error) {
    // Red de seguridad: si aun así chocaran las dos inserciones, manda la que ya está guardada.
    if (esClaveRepetida(error)) {
      const fila = await filaDeLaConfirmacion(peticion.usuarioId, peticion.claveIdempotencia);
      if (fila) return { fila, nueva: false };
    }
    throw error;
  }
}

async function insertar(
  tx: Ejecutor,
  peticion: PeticionEncolado,
  estado: "en_cola" | "esperando_limite",
  reservaId: string | null,
): Promise<FilaTrabajo> {
  const [fila] = await tx
    .insert(generationJobs)
    .values({
      ...peticion.valores,
      idempotencyKey: peticion.claveIdempotencia,
      // La confirmación de derechos se guarda con su fecha: ya se ha comprobado que llegó marcada.
      rightsConfirmedAt: new Date(),
      state: estado,
      reservationId: reservaId,
      failureReason: estado === "esperando_limite" ? "sin_acotar" : null,
      errorMessage: estado === "esperando_limite" && !peticion.acotacion.acotado ? peticion.acotacion.motivo : null,
    })
    .returning();
  if (!fila) throw new ErrorGeneracion(500, "No se ha podido registrar el trabajo.");
  return fila;
}

export async function filaDeLaConfirmacion(
  usuarioId: string,
  claveIdempotencia: string,
  ejecutor: Ejecutor = db(),
): Promise<FilaTrabajo | null> {
  const [fila] = await ejecutor
    .select()
    .from(generationJobs)
    .where(and(eq(generationJobs.userId, usuarioId), eq(generationJobs.idempotencyKey, claveIdempotencia)))
    .limit(1);
  return fila ?? null;
}

/** Violación de una restricción de unicidad en PostgreSQL. */
function esClaveRepetida(error: unknown): boolean {
  const codigo = (error as { code?: unknown } | null)?.code;
  return codigo === "23505" || String((error as Error)?.message ?? "").includes("generation_jobs_usuario_idempotencia");
}
