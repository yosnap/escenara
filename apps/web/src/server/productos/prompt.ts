import { and, eq } from "drizzle-orm";
import { esProductoSolo } from "@/lib/productos";
import type { HechosProducto } from "../controles/contrato";
import { db } from "../db/cliente";
import { products } from "../db/esquema-productos";
import { fragmento, leerCatalogoDeDireccion, nombreDePreset } from "../direccion/catalogo";
import type { ProductoEnPrompt } from "../direccion/producto";
import { fotosDelProducto, type RepartoDeReferencias, repartirReferencias } from "./referencias";

/**
 * **El producto, resuelto para generar** (0.26.0): de la fila del usuario y su clave de acción a lo que
 * necesitan el compositor del prompt, el reparto de referencias y los avisos de antes de pagar.
 *
 * Es el único sitio donde una clave de acción se convierte en texto en inglés, igual que pasa con la dirección
 * del clip (ADR-0022): lo que el usuario eligió son identificadores, y su traducción es material del servidor.
 *
 * La **descripción sale en castellano**, tal como la escribió: quien compone la traduce junto al resto del
 * texto libre, después de todas las puertas gratis. Traducirla aquí obligaría a esta función a llamar a un
 * proveedor, y aquí no se paga nada.
 */

/** El producto de un trabajo, con todo lo que hace falta saber de él para generarlo. */
export interface ProductoParaGenerar {
  id: string;
  nombre: string;
  /** La descripción del usuario, en castellano y sin traducir. */
  descripcionOriginal: string;
  /** La acción elegida, ya en inglés del catálogo. Vacía si no eligió o si su clave ya no existe. */
  accion: string;
  /** El nombre de la acción en castellano: el que leyó en el botón. Es lo que se le enseña a Jev. */
  nombreAccion: string;
  claveAccion: string;
  /** `true` con la acción de b-roll: el producto solo, sin nadie en el plano. */
  soloProducto: boolean;
  /** Lo que el usuario declaró: en el producto se ve una marca. Decide el aviso del filtro del proveedor. */
  marcaVisible: boolean;
  /** Fotos que pueden viajar como referencia, por orden de prioridad. Puede estar vacío. */
  fotos: readonly string[];
}

/**
 * Resuelve el producto de un trabajo. `null` cuando no lleva ninguno, que es lo normal.
 *
 * El dueño va **en el mismo `where`** que el identificador: el producto llega ya comprobado desde la escena o
 * desde la confirmación, y esto es el segundo cierre, no el primero. Un producto que ya no existe devuelve
 * `null` y el trabajo se genera sin él en lugar de fallar: borrarlo no puede romper lo que ya estaba pedido.
 */
export async function productoParaGenerar(
  usuarioId: string,
  productoId: string | null,
  accion: string,
): Promise<ProductoParaGenerar | null> {
  if (!productoId) return null;
  const [fila] = await db()
    .select()
    .from(products)
    .where(and(eq(products.id, productoId), eq(products.ownerId, usuarioId)))
    .limit(1);
  if (!fila) return null;
  const catalogo = await leerCatalogoDeDireccion(usuarioId);
  return {
    id: fila.id,
    nombre: fila.name,
    descripcionOriginal: fila.description.trim(),
    accion: fragmento(catalogo, "accion-producto", accion),
    nombreAccion: nombreDePreset(catalogo, "accion-producto", accion),
    claveAccion: accion,
    soloProducto: esProductoSolo(accion),
    marcaVisible: fila.brandVisible,
    fotos: await fotosDelProducto(fila.id, accion),
  };
}

/**
 * Lo que la puerta de controles necesita saber del producto, con el reparto de referencias ya hecho. Sale de
 * aquí, y no de cada sitio que genera, para que el aviso que se enseña y las fotos que se envían no puedan
 * calcularse con cuentas distintas.
 *
 * `identidadRegistradaPerdida` lo decide quien genera: es lo único que depende del motor de la escena y no
 * del producto.
 */
export function hechosDelProducto(
  producto: ProductoParaGenerar,
  /**
   * Referencias que ese modelo acepta **como galería**, no las que admite en total: en Veo 3.1 la segunda es
   * el último fotograma del clip y meterle ahí la foto de un producto cambiaría el clip en lugar de añadirlo.
   */
  referenciasDeGaleria: number,
  referenciasPersonaje: number,
  identidadRegistradaPerdida: boolean,
): { hechos: HechosProducto; reparto: RepartoDeReferencias } {
  const reparto = repartirReferencias(referenciasDeGaleria, referenciasPersonaje, producto.fotos.length);
  return {
    hechos: {
      nombre: producto.nombre,
      sinFotos: producto.fotos.length === 0,
      referenciasNoCaben: !reparto.cabenTodas,
      identidadRegistradaPerdida,
      marcaVisible: producto.marcaVisible,
    },
    reparto,
  };
}

/**
 * El producto tal como entra en el prompt. `conReferencias` dice si sus fotos van a viajar de verdad: con un
 * modelo donde no cabe ninguna, al modelo se le pide un envase sin marca en lugar de prometerle una foto que
 * no va a recibir, que es lo que le hace inventarse la etiqueta.
 */
export const productoEnPrompt = (
  producto: ProductoParaGenerar,
  descripcionEnIngles: string,
  conReferencias: boolean,
): ProductoEnPrompt => ({
  descripcion: descripcionEnIngles.trim(),
  accion: producto.accion,
  soloProducto: producto.soloProducto,
  conReferencias,
});
