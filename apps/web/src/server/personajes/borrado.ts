import { and, count, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { ESTADOS_CANCELABLES, type EstadoTrabajo } from "@/lib/generacion";
import type { ResumenBorradoPersonaje } from "@/lib/personajes";
import { borrarObjeto } from "../almacenamiento";
import { olvidarPercibidoDePersonaje } from "../coherencia/registro";
import { db } from "../db/cliente";
import {
  characterApprovals,
  characterReferences,
  characters,
  characterVersions,
  consentRecords,
  type FilaTrabajo,
  generationJobs,
  media,
  usageLedger,
} from "../db/esquema";
import type { Actor } from "../media/servicio";
import { cerrarGasto, cerrarTrabajoYGasto } from "../presupuesto/reserva";
import { borrarTraduccionesDePersonaje } from "../prompts/traduccion";
import { filaPropia } from "./consulta";
import { ErrorPersonaje } from "./errores";

/**
 * Borrado de un personaje con sus derivados (RF02 y RF10). Es la operación delicada de la versión: si algo
 * sobrevive, sobrevive la cara de alguien que ha pedido que desaparezca; y si se borra a lo bruto, alguien se
 * queda sin presupuesto para siempre.
 *
 * Qué se borra y qué no:
 *
 * - **se borra** el personaje, sus referencias (la relación), sus registros de consentimiento y los medios
 *   **generados** con él (fotogramas y clips), tanto la fila como el objeto en el almacenamiento;
 * - **no se borran** las fotos de referencia de la biblioteca: son fotos del usuario, que puede estar
 *   usándolas en otro personaje o en otro sitio. Lo que desaparece es la relación con este personaje;
 * - el documento de consentimiento tampoco se borra de la biblioteca: el usuario lo borra cuando quiera
 *   desde la biblioteca, con su papelera y su confirmación.
 *
 * Y lo que decidió la revisión de código:
 *
 * - **un trabajo que ya salió hacia el proveedor impide el borrado** (409). Su tarea existe, se va a cobrar y
 *   su resultado va a llegar: borrar el personaje ahora dejaría el resultado entrando en la biblioteca **sin
 *   personaje al que borrarlo**, y el dinero sin conciliar. Se espera a que termine y luego se borra;
 * - **los que no han salido se cancelan liberando su reserva**, con `cerrarTrabajoYGasto`, antes de tocar nada;
 * - **no se borra ninguna fila de trabajo con la reserva sin cerrar**. `usage_ledger.job_id` es `set null`, así
 *   que un apunte cuyo trabajo se borra pierde la referencia y el barrido de reservas huérfanas —que busca por
 *   `job_id`— dejaría de encontrarlo: la reserva se le quedaría comida al usuario para siempre y en silencio.
 *   Por eso primero se cierra el gasto de todos (reserva liberada, neto cero) y solo después se borran las
 *   filas, dejando escrito en el apunte de qué trabajo y de qué personaje venía.
 *
 * Orden a propósito: primero la transacción que borra las filas, después los objetos del almacenamiento. Al
 * revés, un fallo de la base de datos dejaría filas apuntando a archivos que ya no existen. Así, el peor caso
 * es un objeto huérfano, que se registra con su clave para poder limpiarlo.
 */

/** Estados en los que el trabajo **ya ha tocado al proveedor** o retiene su reserva: impiden el borrado. */
export const ESTADOS_QUE_IMPIDEN: readonly EstadoTrabajo[] = [
  "preparando",
  "enviando",
  "enviado",
  "en_curso",
  "desconocido",
];

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * Hojas de personaje de todas sus versiones: fila y objeto. Se borran con el personaje, igual que los medios
 * generados con él, porque son un montaje **con sus fotos**: dejarlas en la biblioteca sería conservar su cara
 * después de haber pedido que desaparezca.
 */
async function hojasDe(personajeId: string): Promise<{ id: string; clave: string }[]> {
  // Por **los dos caminos**: la marca del propio medio y la referencia desde la versión. La marca es la que
  // encuentra una hoja **huérfana** —creada y guardada, pero que no llegó a quedar apuntada en su versión
  // porque la escritura falló—, que por la otra vía sobreviviría al borrado del personaje.
  const [marcadas, apuntadas] = await Promise.all([
    db().select({ id: media.id, clave: media.storageKey }).from(media).where(eq(media.characterSheetOf, personajeId)),
    db()
      .select({ id: media.id, clave: media.storageKey })
      .from(characterVersions)
      .innerJoin(media, eq(media.id, characterVersions.sheetMediaId))
      .where(eq(characterVersions.characterId, personajeId)),
  ]);
  return [...new Map([...marcadas, ...apuntadas].map((f) => [f.id, f])).values()];
}

/** Medios generados con este personaje: son sus derivados. */
async function derivadosDe(personajeId: string): Promise<{ id: string; clave: string }[]> {
  const filas = await db()
    .select({ id: media.id, clave: media.storageKey })
    .from(generationJobs)
    .innerJoin(media, eq(media.id, generationJobs.resultMediaId))
    .where(eq(generationJobs.characterId, personajeId));
  // El mismo medio no puede ser resultado de dos trabajos, pero se deduplica por si acaso: borrar dos veces
  // el mismo objeto dejaría un error en el registro que no significa nada.
  return [...new Map(filas.map((f) => [f.id, f])).values()];
}

const trabajosDe = (personajeId: string): Promise<FilaTrabajo[]> =>
  db().select().from(generationJobs).where(eq(generationJobs.characterId, personajeId));

/** Identificadores de los trabajos que todavía tienen una reserva sin liberar. */
export async function conReservaAbierta(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const filas = await db()
    .select({ id: usageLedger.jobId })
    .from(usageLedger)
    .where(and(inArray(usageLedger.jobId, ids), eq(usageLedger.entryType, "reserva")))
    .groupBy(usageLedger.jobId);
  const conReserva = filas.flatMap((f) => (f.id ? [f.id] : []));
  if (conReserva.length === 0) return [];
  const liberados = await db()
    .select({ id: usageLedger.jobId })
    .from(usageLedger)
    .where(and(inArray(usageLedger.jobId, conReserva), eq(usageLedger.entryType, "liberacion")))
    .groupBy(usageLedger.jobId);
  const cerrados = new Set(liberados.flatMap((f) => (f.id ? [f.id] : [])));
  return conReserva.filter((id) => !cerrados.has(id));
}

/** Qué se va a borrar, para poder enumerarlo en el diálogo antes de confirmar. */
export async function resumenBorrado(actor: Actor, id: unknown): Promise<ResumenBorradoPersonaje> {
  const personaje = await filaPropia(actor, id);
  const [referencias, trabajos, derivados, hojas, documento] = await Promise.all([
    db().select({ total: count() }).from(characterReferences).where(eq(characterReferences.characterId, personaje.id)),
    trabajosDe(personaje.id),
    derivadosDe(personaje.id),
    hojasDe(personaje.id),
    db()
      .select({ total: count() })
      .from(consentRecords)
      .where(and(eq(consentRecords.characterId, personaje.id), isNotNull(consentRecords.documentMediaId))),
  ]);
  return {
    nombre: personaje.name,
    referencias: referencias[0]?.total ?? 0,
    // La hoja de personaje cuenta como derivado: es un montaje con sus fotos y se borra con él.
    derivados: new Set([...derivados, ...hojas].map((d) => d.id)).size,
    trabajos: trabajos.length,
    trabajosEnMarcha: trabajos.filter((t) => ESTADOS_QUE_IMPIDEN.includes(t.state)).length,
    trabajosPorCancelar: trabajos.filter((t) => ESTADOS_CANCELABLES.includes(t.state)).length,
    conDocumento: (documento[0]?.total ?? 0) > 0,
  };
}

export interface BorradoRealizado {
  personaje: string;
  /** Claves de almacenamiento borradas, para dejar constancia de lo que se llevó por delante. */
  clavesBorradas: string[];
  /** Claves que el almacenamiento no ha podido borrar: quedan huérfanas y se registran. */
  clavesHuerfanas: string[];
  referenciasBorradas: number;
  trabajosBorrados: number;
  /** Trabajos que se han cancelado, liberando su reserva, porque aún no habían salido. */
  trabajosCancelados: number;
}

/**
 * Cancela los trabajos del personaje que todavía no han salido hacia el proveedor, liberando su reserva. El
 * cambio de estado y el apunte van en la misma transacción (`cerrarTrabajoYGasto`), así que no puede quedar un
 * trabajo cancelado con su presupuesto apartado.
 */
async function cancelarLosQueNoSalieron(trabajos: FilaTrabajo[], nombre: string): Promise<number> {
  let cancelados = 0;
  for (const trabajo of trabajos.filter((t) => ESTADOS_CANCELABLES.includes(t.state))) {
    const cerrada = await cerrarTrabajoYGasto(
      trabajo.id,
      inArray(generationJobs.state, [...ESTADOS_CANCELABLES]),
      {
        state: "cancelado",
        failureReason: "cancelado",
        errorMessage: `Cancelado al borrar el personaje «${nombre}»: no había salido hacia el proveedor y no se ha gastado nada.`,
        lockedBy: null,
        lockedUntil: null,
        finishedAt: new Date(),
      },
      0,
      `Cancelado al borrar el personaje «${nombre}»: no ha costado nada.`,
    );
    if (cerrada) cancelados++;
  }
  return cancelados;
}

export async function borrarPersonaje(actor: Actor, id: unknown): Promise<BorradoRealizado> {
  const personaje = await filaPropia(actor, id);

  // ── 1. Un trabajo que ya está en el proveedor no se puede deshacer: se espera a que termine.
  const trabajos = await trabajosDe(personaje.id);
  const enMarcha = trabajos.filter((t) => ESTADOS_QUE_IMPIDEN.includes(t.state));
  if (enMarcha.length > 0) {
    throw new ErrorPersonaje(
      409,
      `«${personaje.name}» tiene ${enMarcha.length === 1 ? "un trabajo" : `${enMarcha.length} trabajos`} que ya ${enMarcha.length === 1 ? "está" : "están"} en el proveedor. No se puede borrar todavía: la tarea existe, se va a cobrar y su resultado va a llegar. Espera a que ${enMarcha.length === 1 ? "termine" : "terminen"} y vuelve a intentarlo. Si quieres dejar de generar con él ya mismo, revoca su consentimiento.`,
    );
  }

  // ── 2. Los que no han salido se cancelan liberando su reserva.
  const cancelados = await cancelarLosQueNoSalieron(trabajos, personaje.name);

  // ── 3. Ninguna fila de trabajo se borra con la reserva sin cerrar. Lo que quede abierto se cierra con los
  // créditos que informó el proveedor (o cero si no llegó a informar), igual que hace el barrido de la cola.
  const idsTrabajos = trabajos.map((t) => t.id);
  for (const abiertoId of await conReservaAbierta(idsTrabajos)) {
    const trabajo = trabajos.find((t) => t.id === abiertoId);
    await cerrarGasto(
      abiertoId,
      trabajo?.consumedCredits ?? 0,
      `Cierre de la reserva de un trabajo terminado, al borrar el personaje «${personaje.name}».`,
    );
  }
  const siguenAbiertas = await conReservaAbierta(idsTrabajos);
  if (siguenAbiertas.length > 0) {
    throw new ErrorPersonaje(
      409,
      `«${personaje.name}» tiene ${siguenAbiertas.length === 1 ? "un trabajo" : `${siguenAbiertas.length} trabajos`} con presupuesto retenido que no se ha podido liberar. No se borra nada: pídele a quien administra que lo resuelva en «Trabajos» antes de borrar el personaje.`,
    );
  }

  // ── 4. Borrado de las filas, en una sola transacción. Las hojas de personaje se borran con él: son un
  // montaje con sus fotos, así que van con los derivados y no se quedan en la biblioteca.
  // Deduplicado **por clave de almacenamiento**, no solo por identificador: un mismo objeto borrado dos veces
  // deja en el registro un error que no significa nada y hace pensar que se ha quedado huérfano.
  const derivados = [
    ...new Map(
      [...(await derivadosDe(personaje.id)), ...(await hojasDe(personaje.id))].map((d) => [d.clave, d]),
    ).values(),
  ];
  const idsDerivados = [...new Set(derivados.map((d) => d.id))];
  const { referencias, borrados } = await db().transaction(async (tx) => {
    const borradasReferencias = await tx
      .delete(characterReferences)
      .where(eq(characterReferences.characterId, personaje.id))
      .returning({ id: characterReferences.id });
    // Los apuntes del registro de gasto no se borran nunca, pero al borrar el trabajo pierden su `job_id`
    // (`set null`). Se deja escrito de dónde venían para que el gasto siga siendo auditable.
    if (idsTrabajos.length > 0) {
      await tx
        .update(usageLedger)
        .set({
          note: sql`${usageLedger.note} || ' (trabajo ' || ${usageLedger.jobId}::text || ' borrado con el personaje «' || ${personaje.name} || '»)'`,
        })
        .where(inArray(usageLedger.jobId, idsTrabajos));
    }
    // Los trabajos, antes que sus medios. No es que la clave ajena lo obligue —`result_media_id` es `set null`,
    // así que borrar el medio primero solo dejaría la columna a nulo—: es que entonces se perdería el vínculo
    // entre el trabajo y el archivo que produjo justo antes de borrar el trabajo, y un fallo a mitad dejaría
    // trabajos apuntando a nada. En este orden, lo que queda a medias es recuperable.
    const borradosTrabajos = await tx
      .delete(generationJobs)
      .where(eq(generationJobs.characterId, personaje.id))
      .returning({ id: generationJobs.id });
    if (idsDerivados.length > 0) await tx.delete(media).where(inArray(media.id, idsDerivados));
    // Los registros de consentimiento, las referencias, las versiones y las aprobaciones caen en cascada con
    // el personaje; se borran explícito para que el recuento sea real y no depender del orden de las cascadas.
    // Las versiones **solo** desaparecen aquí (decisión 3 de la fase 15): mientras el personaje exista son la
    // trazabilidad de lo que ya se generó con él.
    // Las traducciones de su ficha se van con él: su ficha lo describe a él, así que su traducción al inglés es
    // material suyo y no puede sobrevivir a la revocación de su consentimiento (decisión provisional del
    // propietario, 2026-09-27). La cascada de la clave ajena lo haría igual; se hace explícito para que se lea.
    await borrarTraduccionesDePersonaje(tx, personaje.id);
    // Lo que se percibió de su cara y su voz para comprobar la coherencia tampoco sobrevive (antes de borrar el
    // personaje, que es lo que deja a nulo el personaje principal de sus proyectos).
    await olvidarPercibidoDePersonaje(tx, personaje.id);
    await tx.delete(consentRecords).where(eq(consentRecords.characterId, personaje.id));
    await tx.delete(characterApprovals).where(eq(characterApprovals.characterId, personaje.id));
    await tx.delete(characterVersions).where(eq(characterVersions.characterId, personaje.id));
    await tx.delete(characters).where(eq(characters.id, personaje.id));
    return { referencias: borradasReferencias.length, borrados: borradosTrabajos.length };
  });

  // ── 5. Ya no hay filas: los objetos del almacenamiento se borran uno a uno y se registra lo que falle.
  const clavesBorradas: string[] = [];
  const clavesHuerfanas: string[] = [];
  for (const derivado of derivados) {
    try {
      await borrarObjeto(derivado.clave);
      clavesBorradas.push(derivado.clave);
    } catch (error) {
      clavesHuerfanas.push(derivado.clave);
      // Solo el mensaje: la traza no añade nada y estos registros se leen a mano.
      console.error(`[personajes] objeto huérfano tras borrar un personaje: ${derivado.clave}: ${detalle(error)}`);
    }
  }
  console.info(
    `[personajes] personaje borrado · referencias=${referencias} trabajos=${borrados} cancelados=${cancelados} derivados=${clavesBorradas.length} huérfanos=${clavesHuerfanas.length}`,
  );
  return {
    personaje: personaje.name,
    clavesBorradas,
    clavesHuerfanas,
    referenciasBorradas: referencias,
    trabajosBorrados: borrados,
    trabajosCancelados: cancelados,
  };
}
