import { type FamiliaAccionProducto, familiaDeAccion } from "./productos";

/**
 * Cómo se presenta la lista de acciones de un producto. Es lógica pura, sin React, para que se pueda probar
 * y para que la pantalla no decida por su cuenta qué se enseña y qué se pliega.
 *
 * Hay **una sola** acción por producto (`producto.accion`) y todas las familias —general, moda y cuidado de la
 * piel— son partes de la misma lista, no campos independientes.
 *
 * Qué familias salen: el producto solo dice si es físico o digital y si se ve una marca; **no dice si es ropa
 * ni cosmética**, y deducirlo del nombre sería inventarlo (una «caja de verduras» o una «crema de
 * calabaza» engañarían a cualquier heurística). Sin un dato fiable, las familias de nicho no se enseñan
 * siempre: van plegadas en «Más acciones» y se abren solas si la acción elegida es de una de ellas.
 */

/** Las familias que van plegadas: las que solo tienen sentido para cierta clase de producto. */
export const FAMILIAS_PLEGADAS: readonly FamiliaAccionProducto[] = ["moda", "skincare"];

export const TITULO_MAS_ACCIONES = "Más acciones (moda, cuidado de la piel)";

/** Lo que se dice arriba de la lista: es una elección única entre todas las acciones, sean de la familia que sean. */
export const AYUDA_ACCION_UNICA =
  "Elige una sola acción entre todas las de la lista, sea de la familia que sea: es lo que hace el personaje con el producto delante de la cámara.";

/** `true` si la acción elegida es de una familia plegada, y por tanto el bloque «Más acciones» debe estar abierto. */
export const accionEstaPlegada = (accion: string): boolean =>
  accion !== "" && FAMILIAS_PLEGADAS.includes(familiaDeAccion(accion));

/**
 * ¿Está abierto «Más acciones»? Lo que haya decidido la persona con el ratón manda; si no ha tocado nada, se
 * abre solo cuando la acción elegida vive dentro. Así una dirección guardada con «Abrir el bote de crema» no
 * deja la elección escondida.
 */
export const masAccionesAbierto = (abiertoPorLaPersona: boolean | null, accion: string): boolean =>
  abiertoPorLaPersona ?? accionEstaPlegada(accion);

/**
 * El resumen visible de la elección: «Elegida: Abrirlo». Cambia al elegir en cualquier familia, porque es lo
 * único que dice de un vistazo cuál es la acción cuando la elegida está en otra parte de la lista o plegada.
 */
export function resumenAccionElegida(accion: string, acciones: readonly { clave: string; nombre: string }[]): string {
  if (accion === "") return "Elegida: ninguna, lo decide el modelo";
  const nombre = acciones.find((a) => a.clave === accion)?.nombre ?? accion;
  return `Elegida: ${nombre}`;
}
