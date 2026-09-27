/**
 * Reordenar una lista a mano: mover un elemento a otra posición y saber si el orden ha cambiado de verdad.
 *
 * Aquí no hay navegador: son funciones sobre listas de claves. Lo que arrastra el ratón y lo que mueve el
 * teclado pasan por **la misma** función, así que las dos formas de ordenar no pueden dar resultados distintos.
 */

/** Mueve el elemento de `desde` a `hasta` conservando el resto del orden. Fuera de rango devuelve una copia. */
export function moverEnLista<T>(lista: readonly T[], desde: number, hasta: number): T[] {
  const copia = [...lista];
  if (desde < 0 || desde >= copia.length || hasta < 0 || hasta >= copia.length || desde === hasta) return copia;
  const [elemento] = copia.splice(desde, 1);
  copia.splice(hasta, 0, elemento as T);
  return copia;
}

/** ¿Son el mismo orden? Sirve para no llamar al servidor cuando se suelta algo donde estaba. */
export const mismoOrden = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((clave, i) => clave === b[i]);
