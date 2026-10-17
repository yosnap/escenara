/**
 * **El paso «Su primera imagen»** tras dar de alta un lugar o un producto. El alta solo guarda el nombre y la
 * descripción; la ficha se abre con este parámetro para llevar a la persona a ponerle la primera imagen (generarla o
 * subir fotos) en lugar de dejarla delante de una ficha vacía sin saber qué sigue.
 *
 * Sin nada de React: lo usan la lista (al crear), la página de la ficha (en el servidor) y sus pruebas.
 */

export const PARAMETRO_PRIMERA_IMAGEN = "primera-imagen";

/** Ruta de la ficha recién creada, con el paso de la primera imagen delante. */
export const rutaConPrimeraImagen = (ruta: string): string => `${ruta}?${PARAMETRO_PRIMERA_IMAGEN}=1`;

/**
 * Si la ficha abre con el paso: solo cuando se pide y la ficha sigue sin ninguna imagen. Con fotos ya puestas (al
 * recargar después de añadirlas, por ejemplo) no tiene sentido volver a ofrecer la primera.
 */
export function abreConPrimeraImagen(
  parametros: Record<string, string | string[] | undefined>,
  totalImagenes: number,
): boolean {
  return parametros[PARAMETRO_PRIMERA_IMAGEN] === "1" && totalImagenes === 0;
}
