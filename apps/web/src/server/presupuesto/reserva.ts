import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Proveedor } from "@/lib/boveda";
import { formatearCreditos } from "@/lib/generacion";
import { type Ajustes, leerAjustes } from "../ajustes";
import { db, type Ejecutor } from "../db/cliente";
import { type FilaApunte, type FilaTrabajo, generationJobs, usageLedger } from "../db/esquema";
import { ErrorGeneracion } from "../generacion/errores";
import { esUuidGeneracion } from "../generacion/trabajos";
import { comprometidoDe, topesDe } from "./deposito";
import { accionSinPresupuesto, motivoSinPresupuesto } from "./mensajes";

/**
 * Reserva, liberación y consumo del presupuesto. Tres reglas:
 *
 * 1. **La reserva va en la misma transacción que el encolado**, con la fila del usuario bloqueada: dos
 *    trabajos simultáneos no pueden reservar el mismo saldo (igual que la cuota de la biblioteca).
 * 2. **Un trabajo no se cobra dos veces**: el consumo y la liberación son idempotentes por trabajo (índice
 *    único `usage_ledger_trabajo_apunte_uq`), así que un timeout, un sondeo y un callback del proveedor que
 *    lleguen los tres pueden cerrar el mismo trabajo sin duplicar el apunte.
 * 3. **Una reserva solo se libera cuando se sabe qué ha pasado.** Un trabajo `desconocido` la mantiene
 *    retenida hasta que alguien lo resuelve a mano: soltar lo que quizá se ha pagado sería mentir.
 */

/** Versión del registro de precios que viaja dentro del sello (`proveedor:modelo:unidad@vN`). */
export function versionDeSello(sello: string): number | null {
  const version = Number.parseInt(sello.split("@v").at(-1) ?? "", 10);
  return Number.isInteger(version) && version > 0 ? version : null;
}

export interface DatosReserva {
  usuarioId: string;
  trabajoId: string;
  proveedor: Proveedor;
  modelo: string;
  /** Coste máximo estimable del trabajo, en créditos. Es lo que se aparta de verdad en el registro de gasto. */
  creditos: number;
  /**
   * Coste **total del envío** contra el que se mide el tope por trabajo: la generación más su traducción, si esta
   * instalación traduce (decisión provisional del propietario, 2026-09-27). Para quien paga las dos llamadas son
   * un solo envío, y es la misma cifra que mide el motor de controles, así que los dos controles miden lo mismo.
   *
   * No cambia **lo que se aparta**: la traducción tiene su propio apunte. Sin este campo se mide `creditos`, que
   * es lo correcto donde no hay traducción de por medio.
   */
  creditosDelEnvio?: number;
  /** Sello del precio con el que se calculó, para poder auditar la estimación. */
  sello: string;
}

/**
 * Comprueba el tope por trabajo y el presupuesto autorizado del usuario. Tiene que llamarse **dentro** de la
 * transacción que ya bloqueó su fila: si se sumara fuera, dos gastos simultáneos podrían leer el mismo saldo.
 *
 * Lo usan la reserva de un trabajo de generación y la de una llamada del asistente de guion (0.17.0): el texto
 * también cuesta, así que también tiene tope y también consume presupuesto.
 */
export function exigirTopeDeTrabajo(creditos: number, ajustes: Ajustes): void {
  const { topeTrabajo } = topesDe(ajustes);
  if (topeTrabajo !== null && creditos > topeTrabajo) {
    throw new ErrorGeneracion(
      402,
      `Este trabajo necesita ${formatearCreditos(creditos)} y el tope por trabajo de esta instalación es de ${formatearCreditos(topeTrabajo)}. Pídele a quien administra que lo suba.`,
    );
  }
}

export async function exigirPresupuestoDisponible(
  tx: Ejecutor,
  usuarioId: string,
  creditos: number,
  ajustes: Ajustes,
  /**
   * Coste total del envío con el que se mide el **tope por trabajo**; sin él, el que se aparta. La disponibilidad
   * sí se mide con lo que se aparta aquí, porque cada llamada tiene su propio apunte y no se cuenta dos veces.
   */
  creditosDelEnvio = creditos,
): Promise<void> {
  const { autorizado } = topesDe(ajustes);
  exigirTopeDeTrabajo(creditosDelEnvio, ajustes);
  if (autorizado !== null) {
    const { reservado, consumido, retenido, trabajosEnRevision, llamadasDeTextoColgadas } = await comprometidoDe(
      usuarioId,
      tx,
    );
    const disponible = autorizado - reservado - consumido;
    if (creditos > disponible) {
      // El texto lo compone `presupuesto/mensajes.ts`, el mismo que usa el motor de controles: la lectura del
      // panel y esta comprobación, que es la que manda, nunca pueden decir cosas distintas.
      const datos = { disponible, creditos, retenido, trabajosEnRevision, llamadasDeTextoColgadas };
      throw new ErrorGeneracion(402, `${motivoSinPresupuesto(datos)} ${accionSinPresupuesto(datos)}`);
    }
  }
}

/**
 * Comprueba el presupuesto y apunta la reserva. Tiene que llamarse **dentro** de una transacción que ya
 * haya bloqueado la fila del usuario: es lo que serializa dos envíos a la vez.
 */
export async function reservar(tx: Ejecutor, datos: DatosReserva, ajustes: Ajustes): Promise<FilaApunte> {
  await exigirPresupuestoDisponible(tx, datos.usuarioId, datos.creditos, ajustes, datos.creditosDelEnvio);
  let apunte: FilaApunte | undefined;
  try {
    [apunte] = await tx
      .insert(usageLedger)
      .values({
        userId: datos.usuarioId,
        jobId: datos.trabajoId,
        provider: datos.proveedor,
        model: datos.modelo,
        entryType: "reserva",
        credits: datos.creditos,
        amountEur: datos.creditos * ajustes.eurosPorCredito,
        informed: false,
        priceVersion: versionDeSello(datos.sello),
        priceStamp: datos.sello,
        note: "Reserva del coste máximo estimado antes de enviar el trabajo.",
      })
      .returning();
  } catch (error) {
    // El índice único de apuntes automáticos ya tenía una reserva para este trabajo: es una repetición (un
    // doble clic al autorizar un límite), no un error del servidor.
    if (esApunteRepetido(error)) {
      throw new ErrorGeneracion(409, "Este trabajo ya tiene su presupuesto reservado.");
    }
    throw error;
  }
  if (!apunte) throw new ErrorGeneracion(500, "No se ha podido reservar el presupuesto del trabajo.");
  return apunte;
}

/** Violación del índice único de apuntes automáticos (`usage_ledger_trabajo_apunte_uq`). */
function esApunteRepetido(error: unknown): boolean {
  const codigo = (error as { code?: unknown } | null)?.code;
  return codigo === "23505" || String((error as Error)?.message ?? "").includes("usage_ledger_trabajo_apunte");
}

/** Créditos que constan gastados en un trabajo: consumo más los ajustes que ya se le hayan hecho. */
async function consumidoDeTrabajo(trabajoId: string, ejecutor: Ejecutor = db()): Promise<number> {
  const [fila] = await ejecutor
    .select({
      total: sql<number>`coalesce(sum(case when ${usageLedger.entryType} in ('consumo', 'ajuste') then ${usageLedger.credits} else 0 end), 0)::float8`,
    })
    .from(usageLedger)
    .where(eq(usageLedger.jobId, trabajoId));
  return fila?.total ?? 0;
}

/** Apuntes de un trabajo, por tipo. Sirve para saber qué falta por cerrar sin duplicar nada. */
async function apuntesDe(trabajoId: string, ejecutor: Ejecutor = db()): Promise<Map<string, FilaApunte>> {
  const filas = await ejecutor.select().from(usageLedger).where(eq(usageLedger.jobId, trabajoId));
  return new Map(filas.map((f) => [f.entryType, f]));
}

/**
 * Apunta el cierre del gasto de un trabajo **dentro de la transacción de quien llama**: el consumo (los
 * créditos que informa el proveedor, o la estimación marcada como tal si no los informa) y la liberación de la
 * reserva. Es idempotente: llamarla otra vez no crea un segundo consumo ni una segunda liberación.
 *
 * Que reciba la transacción es lo que evita la fuga de reserva: quien cambia el estado del trabajo a terminal
 * apunta el cierre **en la misma transacción**, así que no puede quedar un trabajo cerrado con su reserva
 * apartada porque el apunte fallara después del `UPDATE`.
 */
export async function apuntarCierre(
  tx: Ejecutor,
  trabajoId: string,
  creditosInformados: number | null,
  motivo: string,
  ajustes: Ajustes,
): Promise<void> {
  const apuntes = await apuntesDe(trabajoId, tx);
  const reserva = apuntes.get("reserva");
  if (!reserva) return; // Trabajo anterior a la cola: no hay nada que liberar ni que cerrar.
  const creditos = creditosInformados ?? reserva.credits;
  const comun = {
    userId: reserva.userId,
    jobId: trabajoId,
    provider: reserva.provider,
    model: reserva.model,
    priceVersion: reserva.priceVersion,
    priceStamp: reserva.priceStamp,
  };
  if (!apuntes.has("consumo")) {
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
  if (!apuntes.has("liberacion")) {
    await tx
      .insert(usageLedger)
      .values({
        ...comun,
        entryType: "liberacion",
        credits: -reserva.credits,
        amountEur: -reserva.credits * ajustes.eurosPorCredito,
        informed: false,
        note: "Liberación de la reserva al conciliar el trabajo.",
      })
      .onConflictDoNothing();
  }
  await registrarExceso(tx, trabajoId, creditosInformados, reserva.credits, ajustes);
}

/**
 * Cierra el gasto de un trabajo terminado, en su propia transacción. Lo usan los caminos que ya han dejado el
 * estado del trabajo como corresponde (la conciliación del seguimiento) y el barrido de reservas huérfanas.
 */
export async function cerrarGasto(trabajoId: string, creditosInformados: number | null, motivo: string): Promise<void> {
  const ajustes = await leerAjustes();
  await db().transaction((tx) => apuntarCierre(tx, trabajoId, creditosInformados, motivo, ajustes));
}

/**
 * Cambia el estado de un trabajo a terminal **y** apunta el cierre de su gasto en una sola transacción. Si el
 * `UPDATE` no afecta a ninguna fila (porque el estado ya no era el esperado), no se apunta nada y se devuelve
 * `null`: quien llama decide qué decir.
 */
export async function cerrarTrabajoYGasto(
  trabajoId: string,
  condicion: SQL | undefined,
  cambios: Partial<typeof generationJobs.$inferInsert>,
  creditosInformados: number | null,
  motivo: string,
): Promise<FilaTrabajo | null> {
  const ajustes = await leerAjustes();
  return db().transaction(async (tx) => {
    const [fila] = await tx
      .update(generationJobs)
      .set(cambios)
      .where(condicion ? and(eq(generationJobs.id, trabajoId), condicion) : eq(generationJobs.id, trabajoId))
      .returning();
    if (!fila) return null;
    await apuntarCierre(tx, trabajoId, creditosInformados, motivo, ajustes);
    return fila;
  });
}

/**
 * Deja constancia de que el proveedor ha cobrado más de lo que se había autorizado o apartado. No se puede
 * impedir (el precio final lo decide él) y el consumo que se apunta es el real, así que esto es un **aviso**:
 * queda en el trabajo, para quien lo pidió, y en `/admin/trabajos`, para quien administra.
 *
 * El techo con el que se compara es el más exigente de los que existan: el límite que fijó el usuario, la
 * reserva que se apartó y el tope por trabajo de la instalación. Así también se avisa cuando nadie fijó un
 * límite pero el proveedor se ha pasado de la estimación con la que se reservó.
 *
 * Va dentro de la transacción del cierre y una sola vez: la condición `excess_credits is null` lo garantiza.
 */
async function registrarExceso(
  tx: Ejecutor,
  trabajoId: string,
  creditosInformados: number | null,
  reservado: number,
  ajustes: Ajustes,
): Promise<void> {
  // Sin créditos informados no hay exceso que afirmar: lo apuntado es nuestra propia estimación.
  if (creditosInformados === null) return;
  const [trabajo] = await tx
    .select({
      limite: generationJobs.creditLimit,
      exceso: generationJobs.excessCredits,
      userId: generationJobs.userId,
      provider: generationJobs.provider,
      model: generationJobs.model,
    })
    .from(generationJobs)
    .where(eq(generationJobs.id, trabajoId))
    .limit(1);
  if (!trabajo || trabajo.exceso !== null) return;
  const { topeTrabajo } = topesDe(ajustes);
  const techos = [trabajo.limite, reservado, topeTrabajo].filter((t): t is number => t !== null && t > 0);
  const techo = techos.length > 0 ? Math.min(...techos) : null;
  if (techo === null || creditosInformados <= techo) return;
  const exceso = Math.round(creditosInformados - techo);
  const cual = trabajo.limite !== null && trabajo.limite === techo ? "el límite que se autorizó" : "lo apartado";
  console.warn(
    `[presupuesto] el proveedor ha cobrado ${exceso} créditos por encima de ${techo} en el trabajo ${trabajoId}`,
  );
  // La condición va en el `UPDATE`, no solo en la lectura de arriba: dos cierres a la vez podrían haber
  // leído los dos `excess_credits` a nulo, y así solo uno apunta el aviso.
  const marcados = await tx
    .update(generationJobs)
    .set({ excessCredits: exceso })
    .where(and(eq(generationJobs.id, trabajoId), isNull(generationJobs.excessCredits)))
    .returning({ id: generationJobs.id });
  if (marcados.length === 0) return;
  await tx
    .insert(usageLedger)
    .values({
      userId: trabajo.userId,
      jobId: trabajoId,
      provider: trabajo.provider,
      model: trabajo.model,
      entryType: "ajuste",
      credits: 0,
      amountEur: 0,
      informed: true,
      note: `El proveedor ha cobrado ${exceso} créditos por encima de ${techo} (${cual}). El consumo apuntado es el real.`,
    })
    .onConflictDoNothing();
}

/**
 * Suelta la reserva de un trabajo que **no ha llegado a costar nada** (cancelado por el usuario o fallado
 * antes de que el proveedor aceptara la tarea). Apunta la liberación y un consumo de cero créditos, para
 * que el trabajo quede cerrado y no se pueda volver a cobrar.
 */
export function liberarSinCoste(trabajoId: string, motivo: string): Promise<void> {
  return cerrarGasto(trabajoId, 0, motivo);
}

/**
 * Ajuste manual de quien administra: resuelve un trabajo `desconocido` cuya reserva sigue retenida. Los
 * créditos son los que se hayan comprobado en el proveedor (0 si no llegó a cobrar) y el motivo es
 * obligatorio: un ajuste sin explicación no se puede auditar.
 *
 * Todo va en una transacción con la fila del trabajo bloqueada, y el primer ajuste exige que el trabajo esté
 * de verdad `desconocido`: así dos personas resolviéndolo a la vez no apuntan dos correcciones distintas.
 */
export async function ajustarGasto(
  trabajoId: string,
  creditos: number,
  motivo: string,
  administradorId: string,
): Promise<void> {
  if (!esUuidGeneracion(trabajoId)) throw new ErrorGeneracion(404, "El trabajo no existe.");
  const explicacion = motivo.trim();
  if (explicacion.length < 5) throw new ErrorGeneracion(400, "Escribe por qué se ajusta el gasto de este trabajo.");
  if (!Number.isFinite(creditos) || creditos < 0) {
    throw new ErrorGeneracion(400, "Los créditos ajustados no son válidos.");
  }
  const ajustes = await leerAjustes();
  await db().transaction(async (tx) => {
    const [trabajo] = await tx
      .select()
      .from(generationJobs)
      .where(eq(generationJobs.id, trabajoId))
      .limit(1)
      .for("update");
    if (!trabajo) throw new ErrorGeneracion(404, "El trabajo no existe.");
    const yaResuelto = (await apuntesDe(trabajoId, tx)).has("liberacion");
    // Solo se puede resolver lo que está pendiente de revisión, o corregir lo que ya se resolvió antes.
    if (trabajo.state !== "desconocido" && !yaResuelto) {
      throw new ErrorGeneracion(409, "Este trabajo no está pendiente de revisión.");
    }
    // Cierra el gasto si aún estaba abierto (apunta el consumo y libera la reserva).
    await apuntarCierre(tx, trabajoId, creditos, `Resuelto a mano: ${explicacion}`, ajustes);
    // El ajuste lleva la **diferencia** entre lo que se sabe ahora y lo que había apuntado, así que un segundo
    // ajuste corrige de verdad en lugar de sumarse al primero.
    const delta = creditos - (await consumidoDeTrabajo(trabajoId, tx));
    await tx.insert(usageLedger).values({
      userId: trabajo.userId,
      jobId: trabajoId,
      provider: trabajo.provider,
      model: trabajo.model,
      entryType: "ajuste",
      credits: delta,
      amountEur: delta * ajustes.eurosPorCredito,
      informed: true,
      note:
        delta === 0
          ? explicacion
          : `${explicacion} (corrección de ${delta > 0 ? "+" : ""}${delta} créditos sobre lo apuntado).`,
      createdBy: administradorId,
    });
    // El trabajo deja de estar pendiente de revisión: ya se sabe lo que costó.
    await tx
      .update(generationJobs)
      .set({ state: "fallido", failureReason: "temporal", finishedAt: new Date() })
      .where(and(eq(generationJobs.id, trabajoId), eq(generationJobs.state, "desconocido")));
  });
}
