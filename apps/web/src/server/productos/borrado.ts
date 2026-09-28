import { count, eq, inArray } from "drizzle-orm";
import { ESTADOS_CANCELABLES, type EstadoTrabajo } from "@/lib/generacion";
import { borrarObjeto } from "../almacenamiento";
import { db } from "../db/cliente";
import { generationJobs, media, scenes } from "../db/esquema";
import { productReferences, products } from "../db/esquema-productos";
import type { Actor } from "../media/servicio";
import { cerrarTrabajoYGasto } from "../presupuesto/reserva";
import { filaPropia } from "./consulta";
import { ErrorProducto } from "./errores";

/**
 * Borrado de un producto con sus derivados (0.26.0). Sigue el camino de los personajes (0.13.0), con **una
 * diferencia deliberada** que conviene leer antes de tocar esto:
 *
 * - al borrar un personaje se borran también **sus filas de trabajo**, porque el trabajo es suyo: se pidió con
 *   su cara y no puede sobrevivir a la revocación de su consentimiento;
 * - al borrar un producto **las filas de trabajo se quedan**, con su prompt y su coste, y solo pierden el
 *   producto (`product_id` a nulo). El motivo es que un trabajo con producto lleva casi siempre además la cara
 *   de un personaje: borrarlo se llevaría por delante el historial de ese personaje y dejaría sus apuntes de
 *   gasto sin trabajo al que referirse. Un producto no tiene consentimiento que revocar, así que no hay nada
 *   que obligue a borrar el hecho histórico.
 *
 * Lo que sí desaparece igual que en un personaje son **los medios generados con él**: la fila y el objeto del
 * almacenamiento. Un fotograma con la etiqueta de un producto retirado no se queda en la biblioteca.
 *
 * Qué **no** se borra: las fotos de referencia de la biblioteca. Son fotos del usuario y puede estar usándolas
 * en otro producto. Lo que desaparece es la relación.
 *
 * Y las escenas: pierden el producto (`product_id` a nulo por la clave ajena) y su acción, y **siguen siendo
 * escenas**. Borrar un producto no puede borrar el trabajo de escribir un guion.
 *
 * Orden a propósito, el mismo que en los personajes: primero la transacción que borra las filas, después los
 * objetos del almacenamiento. Al revés, un fallo de la base de datos dejaría filas apuntando a archivos que ya
 * no existen; así, el peor caso es un objeto huérfano, que se registra con su clave para poder limpiarlo.
 */

/** Estados en los que el trabajo **ya ha tocado al proveedor**: impiden el borrado. */
const ESTADOS_QUE_IMPIDEN: readonly EstadoTrabajo[] = ["preparando", "enviando", "enviado", "en_curso", "desconocido"];

const detalle = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** Medios generados con este producto: son sus derivados. */
async function derivadosDe(productoId: string): Promise<{ id: string; clave: string }[]> {
  const filas = await db()
    .select({ id: media.id, clave: media.storageKey })
    .from(generationJobs)
    .innerJoin(media, eq(media.id, generationJobs.resultMediaId))
    .where(eq(generationJobs.productId, productoId));
  // Deduplicado por clave de almacenamiento: borrar dos veces el mismo objeto deja en el registro un error
  // que no significa nada y hace pensar que se ha quedado huérfano.
  return [...new Map(filas.map((f) => [f.clave, f])).values()];
}

const trabajosDe = (productoId: string) =>
  db()
    .select({ id: generationJobs.id, estado: generationJobs.state })
    .from(generationJobs)
    .where(eq(generationJobs.productId, productoId));

export interface ResumenBorradoProducto {
  nombre: string;
  referencias: number;
  derivados: number;
  escenas: number;
  trabajos: number;
  trabajosEnMarcha: number;
  trabajosPorCancelar: number;
}

/** Qué se va a borrar, para poder enumerarlo en el diálogo antes de confirmar. */
export async function resumenBorrado(actor: Actor, id: unknown): Promise<ResumenBorradoProducto> {
  const producto = await filaPropia(actor, id);
  const [referencias, escenas, trabajos, derivados] = await Promise.all([
    db().select({ total: count() }).from(productReferences).where(eq(productReferences.productId, producto.id)),
    db().select({ total: count() }).from(scenes).where(eq(scenes.productId, producto.id)),
    trabajosDe(producto.id),
    derivadosDe(producto.id),
  ]);
  return {
    nombre: producto.name,
    referencias: referencias[0]?.total ?? 0,
    escenas: escenas[0]?.total ?? 0,
    derivados: derivados.length,
    trabajos: trabajos.length,
    trabajosEnMarcha: trabajos.filter((t) => ESTADOS_QUE_IMPIDEN.includes(t.estado)).length,
    trabajosPorCancelar: trabajos.filter((t) => ESTADOS_CANCELABLES.includes(t.estado)).length,
  };
}

export interface BorradoProductoRealizado {
  producto: string;
  /** Claves de almacenamiento borradas, para dejar constancia de lo que se llevó por delante. */
  clavesBorradas: string[];
  /** Claves que el almacenamiento no ha podido borrar: quedan huérfanas y se registran. */
  clavesHuerfanas: string[];
  referenciasBorradas: number;
  /** Escenas que se han quedado sin producto y siguen existiendo. */
  escenasLiberadas: number;
  /** Trabajos que se han cancelado, liberando su reserva, porque aún no habían salido. */
  trabajosCancelados: number;
}

/** Cancela los trabajos del producto que todavía no han salido, liberando su reserva. */
async function cancelarLosQueNoSalieron(
  trabajos: { id: string; estado: EstadoTrabajo }[],
  nombre: string,
): Promise<number> {
  let cancelados = 0;
  for (const trabajo of trabajos.filter((t) => ESTADOS_CANCELABLES.includes(t.estado))) {
    const cerrada = await cerrarTrabajoYGasto(
      trabajo.id,
      inArray(generationJobs.state, [...ESTADOS_CANCELABLES]),
      {
        state: "cancelado",
        failureReason: "cancelado",
        errorMessage: `Cancelado al borrar el producto «${nombre}»: no había salido hacia el proveedor y no se ha gastado nada.`,
        lockedBy: null,
        lockedUntil: null,
        finishedAt: new Date(),
      },
      0,
      `Cancelado al borrar el producto «${nombre}»: no ha costado nada.`,
    );
    if (cerrada) cancelados++;
  }
  return cancelados;
}

export async function borrarProducto(actor: Actor, id: unknown): Promise<BorradoProductoRealizado> {
  const producto = await filaPropia(actor, id);

  // ── 1. Un trabajo que ya está en el proveedor no se puede deshacer: se espera a que termine. Si no, su
  // resultado llegaría a la biblioteca **después** del borrado, sin producto al que borrarlo.
  const trabajos = await trabajosDe(producto.id);
  const enMarcha = trabajos.filter((t) => ESTADOS_QUE_IMPIDEN.includes(t.estado));
  if (enMarcha.length > 0) {
    const uno = enMarcha.length === 1;
    throw new ErrorProducto(
      409,
      `«${producto.name}» tiene ${uno ? "un trabajo" : `${enMarcha.length} trabajos`} que ya ${uno ? "está" : "están"} en el proveedor. No se puede borrar todavía: la tarea existe, se va a cobrar y su resultado va a llegar. Espera a que ${uno ? "termine" : "terminen"} y vuelve a intentarlo.`,
    );
  }

  // ── 2. Los que no han salido se cancelan liberando su reserva, antes de tocar nada.
  const trabajosCancelados = await cancelarLosQueNoSalieron(trabajos, producto.name);

  // ── 3. Borrado de las filas, en una sola transacción.
  const derivados = await derivadosDe(producto.id);
  const idsDerivados = [...new Set(derivados.map((d) => d.id))];
  const { referencias, escenas } = await db().transaction(async (tx) => {
    const borradasReferencias = await tx
      .delete(productReferences)
      .where(eq(productReferences.productId, producto.id))
      .returning({ id: productReferences.id });
    // Las escenas se quedan: pierden el producto y su acción, y siguen produciéndose sin él.
    const liberadas = await tx
      .update(scenes)
      .set({ productId: null, productAction: "", updatedAt: new Date() })
      .where(eq(scenes.productId, producto.id))
      .returning({ id: scenes.id });
    // El trabajo también se queda, con su prompt y su coste. Lo que pierde es el producto; la acción se
    // conserva porque forma parte de lo que se pidió y se pagó.
    await tx.update(generationJobs).set({ productId: null }).where(eq(generationJobs.productId, producto.id));
    if (idsDerivados.length > 0) await tx.delete(media).where(inArray(media.id, idsDerivados));
    await tx.delete(products).where(eq(products.id, producto.id));
    return { referencias: borradasReferencias.length, escenas: liberadas.length };
  });

  // ── 4. Ya no hay filas: los objetos del almacenamiento se borran uno a uno y se registra lo que falle.
  const clavesBorradas: string[] = [];
  const clavesHuerfanas: string[] = [];
  for (const derivado of derivados) {
    try {
      await borrarObjeto(derivado.clave);
      clavesBorradas.push(derivado.clave);
    } catch (error) {
      clavesHuerfanas.push(derivado.clave);
      console.error(`[productos] objeto huérfano tras borrar un producto: ${derivado.clave}: ${detalle(error)}`);
    }
  }
  console.info(
    `[productos] producto borrado · referencias=${referencias} escenas=${escenas} cancelados=${trabajosCancelados} derivados=${clavesBorradas.length} huérfanos=${clavesHuerfanas.length}`,
  );
  return {
    producto: producto.name,
    clavesBorradas,
    clavesHuerfanas,
    referenciasBorradas: referencias,
    escenasLiberadas: escenas,
    trabajosCancelados,
  };
}
