import { and, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import {
  type AlternativaGuardada,
  type ComparativaVista,
  motivoDeConfirmacion,
  type PeticionAB,
} from "@/lib/comparativas";
import { ESTADOS_ACTIVOS, ESTADOS_CANCELABLES } from "@/lib/generacion";
import { falloConCoste } from "@/lib/produccion";
import { escenaPropia } from "../asistente/consulta";
import { ErrorProyecto } from "../asistente/errores";
import { db } from "../db/cliente";
import {
  comparisons,
  type FilaComparativa,
  type FilaEscena,
  type FilaTrabajo,
  generationJobs,
  scenes,
  users,
} from "../db/esquema";
import { claveDerivada } from "../generacion/comprobaciones";
import { HERRAMIENTAS, type Herramientas } from "../generacion/herramientas";
import type { Actor } from "../media/dto";
import { cerrarTrabajoYGasto } from "../presupuesto/reserva";
import { encolarAnimacion } from "../produccion/producir";
import { estimarUna, impedimentosDe, vistaDeComparativa } from "./ab";

/**
 * **Lanzar una comparativa A/B: todo o nada.**
 *
 * 1. Se comprueba lo confirmado (número de ejecuciones y total), el precio y el sello de cada alternativa y, si el
 *    último clip de la escena falló con posible cobro, que haya **un reintento autorizado por alternativa** (ADR-0024:
 *    la A/B no es un atajo).
 * 2. Con la fila del usuario y la de la escena bloqueadas, se comprueba que no hay otra comparativa ni otro clip en marcha
 *    en la escena y se guarda la comparativa **sin lanzar** (`launched_at` nulo).
 * 3. Se encola cada alternativa por el camino normal (`encolarAnimacion` → `crearAnimacion`: controles, techo del
 *    proyecto, presupuesto, credencial, reserva). **Mientras la comparativa no esté lanzada, el worker no toma ninguno de
 *    sus trabajos** (`cola/toma.ts`), así que ninguno puede llegar al proveedor.
 * 4. Si todas caben, se marca lanzada y el worker ya puede enviarlas. Si una no cabe, las que ya estaban encoladas se
 *    cancelan sin cobro, se libera su reserva y se devuelven los reintentos: no se encola ninguna y se dice por qué.
 *
 * Si el proceso muriera entre 2 y 4, el worker cancela la comparativa colgada pasados unos minutos (mismo camino).
 */

/** Pasado este tiempo sin lanzarse, una comparativa se da por interrumpida y se cancela. */
const MS_LANZAMIENTO_COLGADO = 10 * 60_000;

const mismasAlternativas = (guardadas: readonly AlternativaGuardada[], pedidas: PeticionAB["alternativas"]) =>
  guardadas.length === pedidas.length && guardadas.every((g, i) => g.modelo === pedidas[i]?.modelo);

/** Trabajos de las alternativas de una comparativa. */
const trabajosDe = (fila: FilaComparativa) =>
  db()
    .select()
    .from(generationJobs)
    .where(
      and(
        eq(generationJobs.userId, fila.userId),
        inArray(
          generationJobs.idempotencyKey,
          fila.alternatives.map((a) => a.clave),
        ),
      ),
    );

/**
 * Cancela una comparativa no lanzada: sus trabajos (que el worker no ha podido tomar) pasan a cancelados con su reserva
 * liberada y sin coste, se devuelven los reintentos que consumieron y se marca como no lanzada. Idempotente.
 */
export async function cancelarLanzamiento(fila: FilaComparativa, motivo: string): Promise<number> {
  const marcada = await db()
    .update(comparisons)
    .set({ cancelledAt: new Date() })
    .where(and(eq(comparisons.id, fila.id), isNull(comparisons.launchedAt), isNull(comparisons.cancelledAt)))
    .returning({ id: comparisons.id });
  if (marcada.length === 0) return 0;
  let canceladas = 0;
  for (const trabajo of await trabajosDe(fila)) {
    const cerrada = await cerrarTrabajoYGasto(
      trabajo.id,
      inArray(generationJobs.state, [...ESTADOS_CANCELABLES]),
      {
        state: "cancelado",
        failureReason: "cancelado",
        errorMessage: `La comparativa no se lanzó: ${motivo} No se ha enviado nada al proveedor ni se ha cobrado nada.`,
        lockedBy: null,
        lockedUntil: null,
        finishedAt: new Date(),
      },
      0,
      "Comparativa no lanzada: se cancela sin salir hacia el proveedor.",
    );
    if (cerrada) canceladas++;
  }
  // Los reintentos que consumieron estas ejecuciones se devuelven: no ha salido ninguna.
  const reintentos = fila.alternatives.some((a) => a.reintento) ? canceladas : 0;
  if (reintentos > 0) {
    await db()
      .update(scenes)
      .set({ retriesUsed: sql`greatest(${scenes.retriesUsed} - ${reintentos}, 0)`, updatedAt: new Date() })
      .where(eq(scenes.id, fila.sceneId));
  }
  return canceladas;
}

/** Comparativas que se quedaron sin lanzar (el proceso se interrumpió): las cancela el worker. */
export async function barrerLanzamientosColgados(): Promise<number> {
  const colgadas = await db()
    .select()
    .from(comparisons)
    .where(
      and(
        isNull(comparisons.launchedAt),
        isNull(comparisons.cancelledAt),
        lt(comparisons.createdAt, new Date(Date.now() - MS_LANZAMIENTO_COLGADO)),
      ),
    )
    .limit(50);
  for (const fila of colgadas) {
    await cancelarLanzamiento(fila, "el lanzamiento se interrumpió antes de encolar todas las ejecuciones.");
  }
  return colgadas.length;
}

/** `true` si el último fotograma o el último clip de la escena (alternativas incluidas) falló con posible cobro. */
async function trasFalloConCoste(escenaId: string): Promise<boolean> {
  const ultimos: (FilaTrabajo | undefined)[] = await Promise.all(
    (["fotograma", "animacion"] as const).map(async (tipo) => {
      const [fila] = await db()
        .select()
        .from(generationJobs)
        .where(and(eq(generationJobs.sceneId, escenaId), eq(generationJobs.kind, tipo)))
        .orderBy(desc(generationJobs.createdAt))
        .limit(1);
      return fila;
    }),
  );
  return ultimos.some((t) => t !== undefined && t.state === "fallido" && falloConCoste(t.failureReason));
}

function exigirReintentos(escena: FilaEscena, necesarios: number): void {
  if (escena.retryBudget - escena.retriesUsed >= necesarios) return;
  throw new ErrorProyecto(
    409,
    `El último intento de esta escena falló después de hablar con el proveedor, así que puede haberse cobrado. Una comparativa son ${necesarios} intentos más y cada uno consume un reintento autorizado (llevas ${escena.retriesUsed} de ${escena.retryBudget}): autoriza al menos ${necesarios - (escena.retryBudget - escena.retriesUsed)} más y vuelve a pedirla. No se ha encolado nada ni se ha cobrado nada.`,
  );
}

/** Guarda la comparativa sin lanzar, con el usuario y la escena bloqueados: dos A/B a la vez no caben. */
async function guardarSinLanzar(
  actor: Actor,
  escena: FilaEscena,
  proyectoId: string,
  peticion: PeticionAB,
  alternativas: AlternativaGuardada[],
): Promise<FilaComparativa> {
  return db().transaction(async (tx) => {
    // Mismo orden de bloqueo que la cola (usuario → escena): así no hay interbloqueos con un encolado a la vez.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, actor.id)).for("update");
    await tx.select({ id: scenes.id }).from(scenes).where(eq(scenes.id, escena.id)).for("update");
    const [enCurso] = await tx
      .select({ id: comparisons.id })
      .from(comparisons)
      .where(and(eq(comparisons.sceneId, escena.id), isNull(comparisons.launchedAt), isNull(comparisons.cancelledAt)))
      .limit(1);
    const [clipEnMarcha] = await tx
      .select({ id: generationJobs.id })
      .from(generationJobs)
      .where(
        and(
          eq(generationJobs.sceneId, escena.id),
          eq(generationJobs.kind, "animacion"),
          inArray(generationJobs.state, [...ESTADOS_ACTIVOS]),
        ),
      )
      .limit(1);
    if (enCurso || clipEnMarcha) {
      throw new ErrorProyecto(
        409,
        "Ya hay una comparación o un clip en marcha en esta escena. Espera a que termine antes de pedir otra: si no, se pagarían los dos. No se ha encolado nada.",
      );
    }
    const [nueva] = await tx
      .insert(comparisons)
      .values({
        userId: actor.id,
        projectId: proyectoId,
        sceneId: escena.id,
        idempotencyKey: peticion.claveIdempotencia,
        alternatives: alternativas,
        plannedRuns: alternativas.length,
        estimatedCredits: alternativas.reduce((s, a) => s + a.creditos, 0),
      })
      .onConflictDoNothing()
      .returning();
    if (!nueva) {
      throw new ErrorProyecto(409, "Esta comparativa se está lanzando ahora mismo. Espera unos segundos y recarga.");
    }
    return nueva;
  });
}

/**
 * Lanza una A/B, todo o nada. Repetir la misma confirmación (misma clave) no encola nada: devuelve la comparativa si se
 * lanzó y, si no salió, pide confirmar otra vez.
 */
export async function lanzarAB(
  actor: Actor,
  escenaId: unknown,
  peticion: PeticionAB,
  h: Herramientas = HERRAMIENTAS,
): Promise<ComparativaVista & { aviso: string | null }> {
  const { escena, proyecto } = await escenaPropia(actor, escenaId);
  const descuadre = motivoDeConfirmacion(peticion);
  if (descuadre) throw new ErrorProyecto(409, descuadre);

  // Idempotencia por comparativa: la misma confirmación nunca vuelve a encolar nada.
  const [previa] = await db()
    .select()
    .from(comparisons)
    .where(and(eq(comparisons.userId, actor.id), eq(comparisons.idempotencyKey, peticion.claveIdempotencia)))
    .limit(1);
  if (previa) {
    if (previa.sceneId !== escena.id || !mismasAlternativas(previa.alternatives, peticion.alternativas)) {
      throw new ErrorProyecto(
        409,
        "Esa confirmación ya se usó para otra comparativa. Vuelve a confirmar esta. No se ha encolado nada.",
      );
    }
    if (previa.launchedAt) return { ...(await vistaDeComparativa(actor, previa)), aviso: null };
    throw new ErrorProyecto(
      409,
      previa.cancelledAt
        ? "Esa confirmación ya se intentó y la comparativa no salió. Vuelve a confirmarla con el precio de ahora. No se ha cobrado nada."
        : "Esta comparativa se está lanzando ahora mismo. Espera unos segundos y recarga.",
    );
  }

  const impedimentos = await impedimentosDe(escena, proyecto);
  if (impedimentos.length > 0) throw new ErrorProyecto(409, `${impedimentos.join(" ")} No se ha encolado nada.`);
  // El precio de ahora, con la resolución del envío: si no es lo que se confirmó, no sale ninguna.
  const estimadas = await Promise.all(peticion.alternativas.map((a) => estimarUna(proyecto, a.modelo)));
  if (new Set(estimadas.map((e) => e.modelo)).size !== estimadas.length) {
    throw new ErrorProyecto(
      409,
      "Las dos alternativas son en realidad el mismo modelo: elige dos distintos. No se ha encolado nada.",
    );
  }
  const reintento = await trasFalloConCoste(escena.id);
  if (reintento) exigirReintentos(escena, estimadas.length);
  const alternativas: AlternativaGuardada[] = [];
  for (const [i, pedida] of peticion.alternativas.entries()) {
    const estimada = estimadas[i];
    if (!estimada || estimada.impedimento) {
      throw new ErrorProyecto(
        409,
        `${estimada?.impedimento ?? "Ese modelo no se puede usar."} No se ha encolado nada.`,
      );
    }
    if (estimada.sello !== pedida.sello || estimada.creditos !== pedida.creditos) {
      throw new ErrorProyecto(
        409,
        `El precio de ${estimada.nombre} ha cambiado desde que lo viste: ahora cuesta ${estimada.creditos} créditos. Vuelve a confirmar la comparativa. No se ha encolado nada.`,
      );
    }
    alternativas.push({
      modelo: estimada.modelo,
      nombre: estimada.nombre,
      proveedor: estimada.nombreProveedor,
      segundos: estimada.segundos,
      creditos: estimada.creditos,
      sello: estimada.sello,
      clave: claveDerivada(peticion.claveIdempotencia, "comparativa", escena.id, estimada.modelo),
      reintento,
    });
  }

  const comparativa = await guardarSinLanzar(actor, escena, proyecto.id, peticion, alternativas);
  const partida = escena.approvedFrameJobId
    ? { trabajoPadreId: escena.approvedFrameJobId }
    : { medioId: escena.approvedFrameMediaId as string };
  for (const alternativa of alternativas) {
    try {
      await encolarAnimacion(
        actor,
        escena,
        proyecto,
        partida,
        {
          derechos: peticion.derechos,
          derechoMarca: peticion.derechoMarca,
          sinTerceros: peticion.sinTerceros,
          creditosConfirmados: alternativa.creditos,
          selloEstimacion: alternativa.sello,
          claveIdempotencia: peticion.claveIdempotencia,
          avisoUmbralAceptado: peticion.avisoUmbralAceptado,
          avisosConfirmados: peticion.avisosConfirmados,
          modelo: alternativa.modelo,
        },
        alternativa.clave,
        h,
        reintento,
      );
    } catch (error) {
      const causa = error instanceof Error ? error.message : "no se ha podido encolar.";
      await cancelarLanzamiento(comparativa, `${alternativa.nombre} no cabe.`);
      throw new ErrorProyecto(
        409,
        `No se ha lanzado la comparativa: ${alternativa.nombre} no cabe. ${causa} Una comparativa son las dos ejecuciones o ninguna, así que no se ha encolado ninguna. No se ha cobrado nada.`,
      );
    }
  }
  // Todas encoladas: desde ahora el worker puede enviarlas. Si el barrido la canceló entretanto, no sale ninguna.
  const lanzada = await db()
    .update(comparisons)
    .set({ launchedAt: new Date() })
    .where(and(eq(comparisons.id, comparativa.id), isNull(comparisons.cancelledAt)))
    .returning();
  if (!lanzada[0]) {
    throw new ErrorProyecto(
      409,
      "La comparativa tardó demasiado en lanzarse y se ha cancelado sin cobrar nada. Vuelve a pedirla.",
    );
  }
  return { ...(await vistaDeComparativa(actor, lanzada[0])), aviso: null };
}
