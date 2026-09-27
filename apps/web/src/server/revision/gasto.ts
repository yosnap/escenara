import { and, eq, lt, sql } from "drizzle-orm";
import type { Proveedor } from "@/lib/boveda";
import { leerAjustes } from "../ajustes";
import { ErrorProyecto } from "../asistente/errores";
import { db, type Ejecutor } from "../db/cliente";
import { type FilaApunte, type FilaRevision, reviewResults, usageLedger } from "../db/esquema";
import { exigirPresupuestoDisponible, versionDeSello } from "../presupuesto/reserva";
import { exigirClipVigente, guardarRevision, type RevisionPorGuardar, revisionDeLaConfirmacion } from "./resultados";

/**
 * Gasto de una revisión multimodal (RF07). **Mirar un clip con un modelo también cuesta**, así que recorre el
 * mismo camino que un trabajo de generación y que una llamada del asistente:
 *
 * 1. **la fila y su reserva nacen en la misma transacción**, con la fila del usuario bloqueada: dos revisiones a la
 *    vez no pueden reservar el mismo saldo, y no puede quedar una fila sin reserva (que fingiría una revisión que
 *    nadie pagó) ni una reserva sin fila (que apartaría dinero sin nada que lo explique);
 * 2. **idempotencia por confirmación**: la clave que firma el navegador es única por revisor
 *    (`review_results_revisor_idempotencia_uq`), así que un doble clic devuelve la revisión que ya existe y **no
 *    vuelve a llamar al proveedor**;
 * 3. **cierre idempotente**: el consumo y la liberación son únicos por revisión
 *    (`usage_ledger_revision_apunte_uq`), y el consumo son los créditos que informa el proveedor o, si no los
 *    informa, la estimación marcada como tal.
 *
 * Y una fila que se queda en `reservado` porque el proceso murió a mitad no se pierde: {@link
 * barrerRevisionesReservadas} la cierra con la política de ADR-0016 y, hasta entonces, cuenta como **retenido** en
 * el depósito del usuario.
 */

export interface ReservaDeRevision {
  usuarioId: string;
  proveedor: Proveedor;
  modelo: string;
  creditos: number;
  sello: string;
}

export interface RevisionReservada {
  revision: FilaRevision;
  /** `false` cuando esta confirmación ya se había ejecutado: no se ha reservado nada y no hay que llamar a nadie. */
  nueva: boolean;
}

/**
 * Crea la fila de la revisión y aparta su coste, **todo en una transacción**. Si esta confirmación ya se había
 * ejecutado, devuelve la de antes con `nueva: false` y no aparta nada.
 *
 * `datos.claveIdempotencia` y `datos.revisorId` son obligatorios aquí: sin ellos no hay corte de idempotencia, y
 * una revisión de pago sin corte es un doble cobro esperando un doble clic.
 */
export async function crearRevisionReservada(
  datos: RevisionPorGuardar & { claveIdempotencia: string; revisorId: string },
  reserva: ReservaDeRevision,
): Promise<RevisionReservada> {
  const ajustes = await leerAjustes();
  try {
    return await db().transaction(async (tx) => {
      // Bloquea la fila del usuario: es lo que serializa dos revisiones suyas a la vez.
      await tx.execute(sql`select 1 from users where id = ${reserva.usuarioId} for update`);
      const repetida = await revisionDeLaConfirmacion(datos.revisorId, datos.claveIdempotencia, tx);
      if (repetida) return { revision: repetida, nueva: false };
      // Y la de la escena: el clip que se va a revisar tiene que seguir siendo el suyo. Pagarle a un modelo por
      // mirar un vídeo que la escena ya no tiene sería gastar para nada.
      await exigirClipVigente(tx, datos.escenaId, datos.clipMedioId);
      await exigirPresupuestoDisponible(tx, reserva.usuarioId, reserva.creditos, ajustes);
      const revision = await guardarRevision({ ...datos, estado: "reservado" }, tx);
      await tx.insert(usageLedger).values({
        userId: reserva.usuarioId,
        reviewId: revision.id,
        provider: reserva.proveedor,
        model: reserva.modelo,
        entryType: "reserva",
        credits: reserva.creditos,
        amountEur: reserva.creditos * ajustes.eurosPorCredito,
        informed: false,
        priceVersion: versionDeSello(reserva.sello),
        priceStamp: reserva.sello,
        note: "Reserva del coste estimado de la revisión multimodal del clip.",
      });
      return { revision, nueva: true };
    });
  } catch (error) {
    // Red de seguridad: si aun así chocaran las dos inserciones, manda la que ya está guardada.
    if (esClaveRepetida(error)) {
      const fila = await revisionDeLaConfirmacion(datos.revisorId, datos.claveIdempotencia);
      if (fila) return { revision: fila, nueva: false };
    }
    throw error;
  }
}

function esClaveRepetida(error: unknown): boolean {
  const codigo = (error as { code?: unknown } | null)?.code;
  return codigo === "23505" || String((error as Error)?.message ?? "").includes("review_results_revisor_idempotencia");
}

/**
 * Cierra el gasto de la revisión: apunta el consumo (los créditos que informa el proveedor o, si no los informa,
 * la estimación marcada como tal), libera la reserva y deja la fila en `cerrado`. Idempotente por el índice único.
 *
 * Devuelve los créditos que **constan** como consumo, que es lo que se guarda en la fila de la revisión: lo que se
 * le muestra al usuario es lo apuntado, nunca una cifra distinta. En un cierre repetido devuelve los del consumo
 * que ya estaba apuntado, no los que traiga esta llamada: el apunte no se ha cambiado, así que decir otra cosa
 * dejaría la fila y el registro de gasto contando importes distintos.
 */
export async function cerrarGastoDeRevision(
  revisionId: string,
  creditosInformados: number | null,
  motivo: string,
): Promise<number> {
  const ajustes = await leerAjustes();
  return db().transaction(async (tx) => {
    const apuntes: FilaApunte[] = await tx.select().from(usageLedger).where(eq(usageLedger.reviewId, revisionId));
    const reserva = apuntes.find((a) => a.entryType === "reserva");
    if (!reserva) throw new ErrorProyecto(500, "Esta revisión no tiene ninguna reserva que cerrar.");
    const comun = {
      userId: reserva.userId,
      reviewId: revisionId,
      provider: reserva.provider,
      model: reserva.model,
      priceVersion: reserva.priceVersion,
      priceStamp: reserva.priceStamp,
    };
    /**
     * Los créditos que se devuelven son **los que quedan apuntados**, nunca los que traía esta llamada.
     *
     * La lectura de arriba no basta: entre ella y el `insert` puede colarse otro cierre (el barrido del worker
     * cerrando la misma revisión con la estimación mientras la llamada de verdad vuelve con la cifra del
     * proveedor). El índice único deja pasar solo uno, y con `returning()` se sabe **cuál de los dos ganó**: si no
     * devuelve fila, ganó el otro y se relee su apunte dentro de esta misma transacción. Sin esto, quien perdía la
     * carrera escribía en `review_results.credits` una cifra que el registro de gasto no tenía.
     */
    const propuestos = creditosInformados ?? reserva.credits;
    const yaApuntado = apuntes.find((a) => a.entryType === "consumo");
    let creditos = yaApuntado?.credits ?? propuestos;
    let apuntadoAhora = false;
    if (!yaApuntado) {
      const [insertado] = await tx
        .insert(usageLedger)
        .values({
          ...comun,
          entryType: "consumo",
          credits: propuestos,
          amountEur: propuestos * ajustes.eurosPorCredito,
          informed: creditosInformados !== null,
          note: motivo,
        })
        .onConflictDoNothing()
        .returning();
      if (insertado) {
        creditos = insertado.credits;
        apuntadoAhora = true;
      } else {
        // Se adelantó otro cierre. Manda lo suyo: es lo que consta en el registro de gasto.
        const [existente] = await tx
          .select()
          .from(usageLedger)
          .where(and(eq(usageLedger.reviewId, revisionId), eq(usageLedger.entryType, "consumo")))
          .limit(1);
        creditos = existente?.credits ?? propuestos;
      }
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
          note: "Liberación de la reserva al cerrar la revisión multimodal.",
        })
        .onConflictDoNothing();
    }
    /**
     * El exceso se apunta solo si **este** cierre es el que ha dejado el consumo: en un cierre repetido, o cuando
     * se adelantó otro, el importe apuntado no es el que traía esta llamada y avisar de un exceso que no consta
     * sería inventárselo.
     */
    if (apuntadoAhora) await registrarExceso(tx, comun, creditosInformados, reserva.credits);
    // La fila deja de estar `reservado`: su gasto ya está apuntado del todo y el barrido no tiene que tocarla.
    await tx.update(reviewResults).set({ state: "cerrado" }).where(eq(reviewResults.id, revisionId));
    return creditos;
  });
}

/**
 * Deja constancia de que el proveedor ha cobrado **más de lo que se apartó**. No se puede impedir (el precio final
 * lo decide él) y el consumo que se apunta es el real, así que esto es un aviso con su rastro, exactamente como en
 * un trabajo de generación y en una llamada del asistente.
 *
 * Sin créditos informados no hay exceso que afirmar: lo apuntado sería nuestra propia estimación, y comparar una
 * estimación consigo misma no dice nada.
 */
async function registrarExceso(
  tx: Ejecutor,
  comun: { userId: string; reviewId: string; provider: Proveedor; model: string },
  creditosInformados: number | null,
  reservado: number,
): Promise<void> {
  if (creditosInformados === null || creditosInformados <= reservado) return;
  const exceso = Math.round((creditosInformados - reservado) * 100) / 100;
  console.warn(
    `[revisión] el proveedor ha cobrado ${exceso} créditos por encima de ${reservado} en la revisión ${comun.reviewId}`,
  );
  await tx
    .insert(usageLedger)
    .values({
      ...comun,
      entryType: "ajuste",
      credits: 0,
      amountEur: 0,
      informed: true,
      note: `El proveedor ha cobrado ${exceso} créditos por encima de los ${reservado} apartados para esta revisión multimodal. El consumo apuntado es el real.`,
    })
    .onConflictDoNothing();
}

/**
 * Una revisión multimodal que sigue `reservado` más de esto es una revisión que no terminó: el proceso murió entre
 * la reserva y el cierre. Su llamada es síncrona y no tarda minutos.
 */
export const MS_MAXIMO_RESERVADO = 10 * 60 * 1000;

/**
 * Barrido de las revisiones multimodales que se quedaron `reservado`: cierra su gasto **conservando la estimación**
 * como consumo y liberando la reserva.
 *
 * Conservar la estimación y no soltarla es deliberado: no se sabe si el proveedor ejecutó la llamada, y soltar lo
 * que quizá se ha pagado sería mentir sobre el gasto (ADR-0016). Es la misma política que con los trabajos
 * `desconocido` y con las llamadas de texto colgadas. Es idempotente: barrer dos veces no duplica apuntes.
 */
export async function barrerRevisionesReservadas(limite = 50): Promise<number> {
  const corte = new Date(Date.now() - MS_MAXIMO_RESERVADO);
  const colgadas = await db()
    .select({ id: reviewResults.id })
    .from(reviewResults)
    .where(and(eq(reviewResults.state, "reservado"), lt(reviewResults.createdAt, corte)))
    .limit(limite);
  let cerradas = 0;
  for (const { id } of colgadas) {
    try {
      await cerrarGastoDeRevision(
        id,
        // `null` = se conserva la estimación como consumo, marcada como estimación nuestra.
        null,
        "La revisión multimodal no llegó a cerrarse y no se sabe si el proveedor la ejecutó: se conserva la estimación.",
      );
      await db()
        .update(reviewResults)
        .set({
          notes:
            "La revisión con modelo se interrumpió antes de terminar. Se conserva su estimación como gasto porque no se sabe si el proveedor llegó a ejecutarla.",
        })
        .where(and(eq(reviewResults.id, id), eq(reviewResults.notes, "")));
      console.warn(`[revisión] revisión multimodal ${id} cerrada por el barrido: se conserva su estimación`);
      cerradas++;
    } catch (error) {
      console.error(`[revisión] no se ha podido cerrar la revisión ${id}: ${String(error)}`);
    }
  }
  return cerradas;
}
