import { and, eq, lt, sql } from "drizzle-orm";
import type { Proveedor } from "@/lib/boveda";
import { type Ajustes, leerAjustes } from "../ajustes";
import { db, type Ejecutor } from "../db/cliente";
import { assistantRuns, type FilaApunte, type FilaEjecucionAsistente, usageLedger } from "../db/esquema";
import { exigirPresupuestoDisponible, versionDeSello } from "../presupuesto/reserva";
import { ErrorProyecto } from "./errores";

/**
 * Gasto de una llamada al modelo de texto del asistente. **El texto también cuesta**, así que recorre el mismo
 * camino que un trabajo de generación, con la única diferencia de que su llamada es síncrona y por tanto no
 * pasa por la cola:
 *
 * 1. **reserva antes de llamar**, en la misma transacción que crea la ejecución y con la fila del usuario
 *    bloqueada: dos llamadas a la vez no reservan el mismo saldo;
 * 2. **idempotencia por confirmación**: la clave que firma el navegador es única por usuario
 *    (`assistant_runs_usuario_idempotencia_uq`), así que un doble clic devuelve la ejecución que ya existe y
 *    **no vuelve a llamar al proveedor**;
 * 3. **cierre idempotente**: el consumo y la liberación son únicos por ejecución
 *    (`usage_ledger_ejecucion_apunte_uq`), y el consumo son los créditos que informa el proveedor
 *    (`credits_consumed`) o, si no los informa, la estimación marcada como tal.
 */

export interface NuevaEjecucion {
  usuarioId: string;
  /** Proyecto al que pertenece; `null` en las traducciones, que no son de ningún proyecto. */
  proyectoId: string | null;
  kind: FilaEjecucionAsistente["kind"];
  proveedor: Proveedor;
  modelo: string;
  claveIdempotencia: string;
  creditos: number;
  sello: string;
}

export interface EjecucionReservada {
  ejecucion: FilaEjecucionAsistente;
  /** `false` cuando esta confirmación ya se había ejecutado: no se ha reservado ni se va a llamar a nadie. */
  nueva: boolean;
}

/** Ejecución que ya salió de esta misma confirmación, si la hay. */
export async function ejecucionDeLaConfirmacion(
  usuarioId: string,
  claveIdempotencia: string,
  ejecutor: Ejecutor = db(),
): Promise<FilaEjecucionAsistente | null> {
  const [fila] = await ejecutor
    .select()
    .from(assistantRuns)
    .where(and(eq(assistantRuns.userId, usuarioId), eq(assistantRuns.idempotencyKey, claveIdempotencia)))
    .limit(1);
  return fila ?? null;
}

/**
 * Crea la ejecución y aparta su coste estimado, todo en una transacción. Si esta confirmación ya se había
 * ejecutado, devuelve la de antes con `nueva: false` y no aparta nada.
 */
export async function reservarEjecucion(datos: NuevaEjecucion): Promise<EjecucionReservada> {
  const ajustes = await leerAjustes();
  try {
    return await db().transaction(async (tx) => {
      // Bloquea la fila del usuario: es lo que serializa dos llamadas suyas a la vez.
      await tx.execute(sql`select 1 from users where id = ${datos.usuarioId} for update`);
      const repetida = await ejecucionDeLaConfirmacion(datos.usuarioId, datos.claveIdempotencia, tx);
      if (repetida) return { ejecucion: repetida, nueva: false };
      await exigirPresupuestoDisponible(tx, datos.usuarioId, datos.creditos, ajustes);
      const [ejecucion] = await tx
        .insert(assistantRuns)
        .values({
          userId: datos.usuarioId,
          projectId: datos.proyectoId,
          kind: datos.kind,
          provider: datos.proveedor,
          model: datos.modelo,
          idempotencyKey: datos.claveIdempotencia,
          state: "reservado",
          estimatedCredits: datos.creditos,
          priceStamp: datos.sello,
        })
        .returning();
      if (!ejecucion) throw new ErrorProyecto(500, "No se ha podido registrar la llamada al asistente.");
      await tx.insert(usageLedger).values({
        userId: datos.usuarioId,
        assistantRunId: ejecucion.id,
        provider: datos.proveedor,
        model: datos.modelo,
        entryType: "reserva",
        credits: datos.creditos,
        amountEur: datos.creditos * ajustes.eurosPorCredito,
        informed: false,
        priceVersion: versionDeSello(datos.sello),
        priceStamp: datos.sello,
        note: "Reserva del coste estimado de la llamada al asistente de guion.",
      });
      return { ejecucion, nueva: true };
    });
  } catch (error) {
    // Red de seguridad: si aun así chocaran las dos inserciones, manda la que ya está guardada.
    if (esClaveRepetida(error)) {
      const fila = await ejecucionDeLaConfirmacion(datos.usuarioId, datos.claveIdempotencia);
      if (fila) return { ejecucion: fila, nueva: false };
    }
    throw error;
  }
}

function esClaveRepetida(error: unknown): boolean {
  const codigo = (error as { code?: unknown } | null)?.code;
  return codigo === "23505" || String((error as Error)?.message ?? "").includes("assistant_runs_usuario_idempotencia");
}

/**
 * Cierra el gasto de una ejecución: apunta el consumo (lo que informa el proveedor, o la estimación marcada
 * como tal) y libera la reserva. Es idempotente, así que cerrar dos veces no cobra dos veces.
 *
 * `creditosInformados` a 0 es el cierre de una llamada que no llegó a costar nada (el proveedor la rechazó
 * antes de ejecutarla): se apunta 0 y se suelta la reserva.
 */
export async function cerrarGastoDeEjecucion(
  ejecucionId: string,
  creditosInformados: number | null,
  motivo: string,
  estado: FilaEjecucionAsistente["state"],
  escenasPropuestas = 0,
  mensajeError: string | null = null,
): Promise<void> {
  const ajustes = await leerAjustes();
  await db().transaction(async (tx) => {
    const apuntes = await tx.select().from(usageLedger).where(eq(usageLedger.assistantRunId, ejecucionId));
    const reserva = apuntes.find((a) => a.entryType === "reserva");
    if (reserva) {
      await apuntarCierre(tx, ejecucionId, reserva, apuntes, creditosInformados, motivo, ajustes);
    }
    // Techo de esta llamada: lo que se apartó. Si el proveedor ha cobrado más, no se puede impedir (el precio lo
    // decide él), pero se apunta y se ve en `/admin/trabajos`, igual que el exceso de un trabajo de generación.
    const reservado = reserva?.credits ?? null;
    const exceso =
      creditosInformados !== null && reservado !== null && creditosInformados > reservado
        ? Math.round((creditosInformados - reservado) * 100) / 100
        : null;
    if (exceso !== null) {
      console.warn(
        `[asistente] el proveedor ha cobrado ${exceso} créditos por encima de ${reservado} en la llamada ${ejecucionId}`,
      );
      await tx
        .insert(usageLedger)
        .values({
          userId: reserva?.userId ?? "",
          assistantRunId: ejecucionId,
          provider: reserva?.provider ?? "kie",
          model: reserva?.model ?? "",
          entryType: "ajuste",
          credits: 0,
          amountEur: 0,
          informed: true,
          note: `El proveedor ha cobrado ${exceso} créditos por encima de los ${reservado} apartados para esta llamada de texto. El consumo apuntado es el real.`,
        })
        .onConflictDoNothing();
    }
    await tx
      .update(assistantRuns)
      .set({
        state: estado,
        consumedCredits: creditosInformados,
        scenesProposed: escenasPropuestas,
        errorMessage: mensajeError,
        ...(exceso === null ? {} : { excessCredits: exceso }),
        finishedAt: new Date(),
      })
      .where(eq(assistantRuns.id, ejecucionId));
  });
}

async function apuntarCierre(
  tx: Ejecutor,
  ejecucionId: string,
  reserva: FilaApunte,
  apuntes: FilaApunte[],
  creditosInformados: number | null,
  motivo: string,
  ajustes: Ajustes,
): Promise<void> {
  const creditos = creditosInformados ?? reserva.credits;
  const comun = {
    userId: reserva.userId,
    assistantRunId: ejecucionId,
    provider: reserva.provider,
    model: reserva.model,
    priceVersion: reserva.priceVersion,
    priceStamp: reserva.priceStamp,
  };
  if (!apuntes.some((a) => a.entryType === "consumo")) {
    await tx
      .insert(usageLedger)
      .values({
        ...comun,
        entryType: "consumo",
        credits: creditos,
        amountEur: creditos * ajustes.eurosPorCredito,
        informed: creditosInformados !== null,
        note: motivo,
      })
      .onConflictDoNothing();
  }
  if (!apuntes.some((a) => a.entryType === "liberacion")) {
    await tx
      .insert(usageLedger)
      .values({
        ...comun,
        entryType: "liberacion",
        credits: -reserva.credits,
        amountEur: -reserva.credits * ajustes.eurosPorCredito,
        informed: false,
        note: "Liberación de la reserva al cerrar la llamada al asistente.",
      })
      .onConflictDoNothing();
  }
}

/**
 * Una llamada de texto que se queda en `reservado` más de esto es una llamada que no terminó: el proceso murió
 * entre la reserva y el cierre. Una síncrona no tarda más de un minuto y medio (el cliente corta a los 45 s).
 */
export const MS_MAXIMO_RESERVADO = 10 * 60 * 1000;

/**
 * Barrido de las llamadas de texto que se quedaron `reservado`: cierra su gasto **conservando la estimación**
 * como consumo.
 *
 * Conservar la estimación y no soltarla es deliberado: no se sabe si el proveedor ejecutó la llamada, y soltar
 * lo que quizá se ha pagado sería mentir sobre el gasto. Es la misma regla que con los trabajos `desconocido`
 * (ADR-0016). Es idempotente: cerrar dos veces no duplica apuntes.
 */
export async function barrerEjecucionesReservadas(limite = 50): Promise<number> {
  const corte = new Date(Date.now() - MS_MAXIMO_RESERVADO);
  const colgadas = await db()
    .select({ id: assistantRuns.id })
    .from(assistantRuns)
    .where(and(eq(assistantRuns.state, "reservado"), lt(assistantRuns.createdAt, corte)))
    .limit(limite);
  let cerradas = 0;
  for (const { id } of colgadas) {
    try {
      await cerrarGastoDeEjecucion(
        id,
        // `null` = se conserva la estimación como consumo, marcada como estimación nuestra.
        null,
        "La llamada al modelo de texto no llegó a cerrarse y no se sabe si el proveedor la ejecutó: se conserva la estimación.",
        "fallido",
        0,
        "La llamada se interrumpió antes de terminar.",
      );
      console.warn(`[asistente] llamada de texto ${id} cerrada por el barrido: se conserva su estimación`);
      cerradas++;
    } catch (error) {
      console.error(`[asistente] no se ha podido cerrar la llamada ${id}: ${String(error)}`);
    }
  }
  return cerradas;
}
