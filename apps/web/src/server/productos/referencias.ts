import { and, asc, eq, isNull } from "drizzle-orm";
import type { PapelReferencia } from "@/lib/productos";
import { db } from "../db/cliente";
import { media } from "../db/esquema";
import { productReferences } from "../db/esquema-productos";

/**
 * **Qué fotos del producto viajan al proveedor y cuántas caben** (0.26.0).
 *
 * Un modelo admite un número fijo de imágenes de referencia (`parametros.maximoReferencias`), y con producto
 * hay dos cosas que quieren ese sitio: la **identidad del personaje** y el **producto**. No caben siempre las
 * dos enteras, así que el reparto es una decisión explícita y se toma en un solo sitio para que la puerta que
 * avisa antes de pagar y el worker que envía no puedan repartir distinto.
 *
 * El reparto: se le reserva al producto **al menos una** foto —sin ninguna, el producto no llega y el prompt
 * estaría prometiendo algo que el modelo no puede ver—, y el resto del cupo es del personaje, que es lo que
 * sostiene la cara. Cuando algo se queda fuera, se dice antes de cobrar (regla `producto-referencias-no-caben`).
 */

/**
 * Orden de prioridad de los papeles. La **frontal con la etiqueta** va siempre primero: es la que se compara
 * con el resultado y la que esta versión promete conservar. Después la captura de pantalla (es la etiqueta de
 * un producto digital), el envase, el mecanismo y el producto suelto.
 */
const PRIORIDAD: Record<PapelReferencia, number> = {
  etiqueta: 0,
  captura_pantalla: 1,
  envase: 2,
  mecanismo: 3,
  suelto: 4,
};

/**
 * Prioridad de la acción: al **abrir** el producto, el detalle del mecanismo pasa por delante del envase. Es
 * la única acción que mira una parte concreta, y la fuente avisa de que sin esa segunda referencia sale mal.
 */
const ACCIONES_DE_ABRIR: readonly string[] = ["abrirlo", "skincare-abrir-tapa"];

/**
 * Fotos del producto que pueden viajar, ordenadas por prioridad de papel y, dentro de un papel, como las dejó
 * su dueño. Se excluyen las que están en la papelera: su archivo puede desaparecer en cualquier momento.
 */
export async function fotosDelProducto(
  productoId: string,
  accion = "",
  /**
   * Papel único que se admite en este envío. Lo usa el **segundo paso del producto digital**: ahí lo que se
   * inserta es la captura de pantalla y nada más, y mandarle además el envase le daría al modelo una segunda
   * imagen que podría acabar dentro de la pantalla.
   */
  soloPapel?: PapelReferencia,
): Promise<string[]> {
  const filas = await db()
    .select({ mediaId: productReferences.mediaId, papel: productReferences.kind, orden: productReferences.sortOrder })
    .from(productReferences)
    .innerJoin(media, eq(media.id, productReferences.mediaId))
    .where(
      and(
        eq(productReferences.productId, productoId),
        isNull(media.deletedAt),
        ...(soloPapel ? [eq(productReferences.kind, soloPapel)] : []),
      ),
    )
    .orderBy(asc(productReferences.sortOrder), asc(productReferences.createdAt));
  const peso = (papel: PapelReferencia) =>
    ACCIONES_DE_ABRIR.includes(accion) && papel === "mecanismo" ? PRIORIDAD.envase - 0.5 : PRIORIDAD[papel];
  return [...filas].sort((a, b) => peso(a.papel) - peso(b.papel) || a.orden - b.orden).map((f) => f.mediaId);
}

/** Cómo se reparte el cupo de referencias del modelo entre el personaje y el producto. */
export interface RepartoDeReferencias {
  /** Cuántas fotos del personaje (o el fotograma de partida del clip) se envían. Nunca menos de una. */
  personaje: number;
  /** Cuántas fotos del producto se envían. */
  producto: number;
  /** `false` cuando algo se ha quedado fuera por el tope del modelo. Es lo que se avisa antes de pagar. */
  cabenTodas: boolean;
}

/**
 * Reparte el cupo. Función **pura**: la usan la puerta que avisa y el worker que envía, y por eso no puede
 * vivir dentro de ninguno de los dos.
 *
 * - sin producto, todo el cupo es del personaje, exactamente como antes de esta versión;
 * - con producto, se le reserva al menos una foto y el personaje se queda con el resto;
 * - con un modelo que solo admite una imagen, la única que cabe es la del **personaje**: es la imagen de
 *   partida del clip, y sin ella no hay nada que animar. El producto se queda en el texto y se avisa;
 * - **sin ninguna imagen de personaje** —el plano del producto solo, que se pide sin nadie—, todo el cupo es
 *   del producto: reservarle un hueco a una imagen que no existe dejaría fuera una foto del producto por
 *   nada.
 */
export function repartirReferencias(maximo: number, personaje: number, producto: number): RepartoDeReferencias {
  /**
   * Un envío **sin ninguna referencia posible** (un modelo de texto a imagen, que es con lo que se genera un
   * plano sin foto de partida): no viaja nada, tampoco del producto. Se dice antes de cobrar y al modelo se
   * le pide un envase sin marca en vez de prometerle una foto que no va a recibir.
   */
  if (maximo <= 0) return { personaje: 0, producto: 0, cabenTodas: personaje === 0 && producto === 0 };
  const cupo = Math.max(1, maximo);
  if (producto <= 0) {
    return { personaje: Math.min(personaje, cupo), producto: 0, cabenTodas: personaje <= cupo };
  }
  if (personaje <= 0) {
    const paraProducto = Math.min(producto, cupo);
    return { personaje: 0, producto: paraProducto, cabenTodas: paraProducto >= producto };
  }
  const paraProducto = Math.min(producto, Math.max(0, cupo - 1));
  const paraPersonaje = Math.min(personaje, cupo - paraProducto);
  return {
    personaje: paraPersonaje,
    producto: paraProducto,
    cabenTodas: paraPersonaje >= personaje && paraProducto >= producto,
  };
}
