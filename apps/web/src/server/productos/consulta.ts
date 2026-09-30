import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Medio } from "@/lib/media/tipos";
import type { ProductoResumen, ProductoVista, ReferenciaProducto } from "@/lib/productos";
import { db } from "../db/cliente";
import { type FilaMedio, media } from "../db/esquema";
import { type FilaProducto, type FilaReferenciaProducto, productReferences, products } from "../db/esquema-productos";
import type { Actor } from "../media/servicio";
import { aDto } from "../media/servicio";
import { ErrorProducto } from "./errores";

/**
 * Lectura de productos. **Todo pasa por el dueño**: el identificador y el `owner_id` van siempre en el mismo
 * `where`, así que un producto de otra persona responde 404 y ni se dice que existe.
 *
 * Aquí no hay excepción para quien administra, a diferencia de los personajes: un personaje se revisa (hay un
 * consentimiento que comprobar), y un producto no tiene nada que revisar. Es material del usuario y se queda
 * en su cuenta.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un identificador que no tiene forma de UUID se responde como «no existe», no como error de la base. */
export function exigirUuid(id: unknown): string {
  if (typeof id !== "string" || !UUID.test(id)) throw new ErrorProducto(404, "Ese producto no existe.");
  return id;
}

/** La fila, solo si es suya. Es la única puerta de lectura por identificador. */
export async function filaPropia(actor: Actor, id: unknown): Promise<FilaProducto> {
  const [fila] = await db()
    .select()
    .from(products)
    .where(and(eq(products.id, exigirUuid(id)), eq(products.ownerId, actor.id)))
    .limit(1);
  if (!fila) throw new ErrorProducto(404, "Ese producto no existe.");
  return fila;
}

/** Medios de la biblioteca por identificador, para montar las vistas sin una consulta por fila. */
async function mediosPorId(ids: string[], actor: Actor): Promise<Map<string, Medio>> {
  if (ids.length === 0) return new Map();
  const filas = await db()
    .select()
    .from(media)
    .where(inArray(media.id, [...new Set(ids)]));
  return new Map(filas.map((f: FilaMedio) => [f.id, aDto(f, actor)]));
}

/** Referencias de varios productos de una vez, ordenadas como las dejó su dueño. */
async function referenciasDe(productoIds: string[]): Promise<FilaReferenciaProducto[]> {
  if (productoIds.length === 0) return [];
  return db()
    .select()
    .from(productReferences)
    .where(inArray(productReferences.productId, productoIds))
    .orderBy(asc(productReferences.sortOrder), asc(productReferences.createdAt));
}

const resumen = (fila: FilaProducto, referencias: FilaReferenciaProducto[], medios: Map<string, Medio>) => {
  // Las que están en la papelera se siguen contando como referencia (para que se vea qué ha pasado), pero no
  // sirven de portada: una miniatura de algo borrado haría creer que el producto está completo.
  const vigentes = referencias.filter((r) => medios.get(r.mediaId)?.enPapelera === false);
  return {
    id: fila.id,
    nombre: fila.name,
    descripcion: fila.description,
    tipo: fila.kind,
    marcaVisible: fila.brandVisible,
    referencias: referencias.length,
    fotosVigentes: vigentes.length,
    portada: vigentes[0] ? (medios.get(vigentes[0].mediaId) ?? null) : null,
    actualizado: fila.updatedAt.toISOString(),
  } satisfies ProductoResumen;
};

/** Los productos de esta persona, del más reciente al más antiguo. */
export async function listarProductos(actor: Actor): Promise<ProductoResumen[]> {
  const filas = await db()
    .select()
    .from(products)
    .where(eq(products.ownerId, actor.id))
    .orderBy(desc(products.updatedAt));
  const referencias = await referenciasDe(filas.map((f) => f.id));
  const medios = await mediosPorId(
    referencias.map((r) => r.mediaId),
    actor,
  );
  return filas.map((fila) =>
    resumen(
      fila,
      referencias.filter((r) => r.productId === fila.id),
      medios,
    ),
  );
}

/** La ficha completa con sus fotos. Una de otra persona responde 404. */
export async function obtenerProducto(actor: Actor, id: unknown): Promise<ProductoVista> {
  const fila = await filaPropia(actor, id);
  const referencias = await referenciasDe([fila.id]);
  const medios = await mediosPorId(
    referencias.map((r) => r.mediaId),
    actor,
  );
  const fotos = referencias.flatMap((r): ReferenciaProducto[] => {
    const medio = medios.get(r.mediaId);
    // Una referencia cuya foto ya no está se omite en lugar de romper la ficha. La cascada de la clave ajena
    // lo evita, pero la vista no depende de que la cascada haya corrido.
    return medio ? [{ id: r.id, papel: r.kind, orden: r.sortOrder, medio }] : [];
  });
  return { ...resumen(fila, referencias, medios), fotos };
}

/** Siguiente número de orden de las fotos de un producto. */
export async function siguienteOrden(productoId: string): Promise<number> {
  const filas = await db()
    .select({ orden: productReferences.sortOrder })
    .from(productReferences)
    .where(eq(productReferences.productId, productoId))
    .orderBy(desc(productReferences.sortOrder))
    .limit(1);
  return (filas[0]?.orden ?? 0) + 1;
}
