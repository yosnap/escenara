/**
 * **El paso «Su primera imagen»** tras dar de alta un lugar o un producto. El alta solo guarda el nombre y la
 * descripción; la ficha se abre con este parámetro para llevar a la persona a ponerle la primera imagen (generarla o
 * subir fotos) en lugar de dejarla delante de una ficha vacía sin saber qué sigue.
 *
 * Sin nada de React: lo usan la lista (al crear), la ficha (con la dirección del navegador) y sus pruebas.
 */

export const PARAMETRO_PRIMERA_IMAGEN = "primera-imagen";

/** Ruta de la ficha recién creada, con el paso de la primera imagen delante. */
export const rutaConPrimeraImagen = (ruta: string): string => `${ruta}?${PARAMETRO_PRIMERA_IMAGEN}=1`;

/**
 * Si la ficha enseña el paso, según la dirección **actual** (no la que pintó el servidor): solo cuando lo pide y la
 * ficha sigue sin ninguna imagen. Con fotos ya puestas no tiene sentido volver a ofrecer la primera, y al volver con
 * «Atrás» la dirección ya no lleva el parámetro, aunque Next restaure una ficha guardada de antes.
 */
export function abreConPrimeraImagen(valorDelParametro: string | null, totalImagenes: number): boolean {
  return valorDelParametro === "1" && totalImagenes === 0;
}
