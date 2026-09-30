/**
 * Renumerar el orden de un grupo (las plantillas de una capacidad, los presets de una categoría) a partir de la
 * lista completa de sus identificadores. Es lógica pura: la comparten el servidor, que es quien decide, y los
 * tests.
 */

/** Separación entre posiciones consecutivas: deja hueco por si alguna vez hace falta intercalar a mano. */
export const PASO_ORDEN_DE_GRUPO = 10;

/**
 * Comprueba que `recibidos` son **exactamente** los identificadores del grupo (ni uno de más, ni uno de menos, ni
 * repetidos) y devuelve el número de orden que le toca a cada uno, de 10 en 10 desde 10 y sin empates.
 * Lanza el mensaje ya redactado para mostrarlo tal cual.
 */
export function renumerarGrupo(idsDelGrupo: readonly string[], recibidos: unknown): { id: string; orden: number }[] {
  if (!Array.isArray(recibidos) || recibidos.some((id) => typeof id !== "string")) {
    throw new Error("El orden tiene que ser una lista de identificadores.");
  }
  const ids = recibidos as string[];
  if (new Set(ids).size !== ids.length) throw new Error("El orden repite algún elemento.");
  const delGrupo = new Set(idsDelGrupo);
  if (ids.some((id) => !delGrupo.has(id))) throw new Error("El orden incluye algo que no es de este grupo.");
  if (ids.length !== delGrupo.size) {
    throw new Error(
      "El orden tiene que incluir todos los elementos del grupo: recarga la página e inténtalo otra vez.",
    );
  }
  return ids.map((id, i) => ({ id, orden: (i + 1) * PASO_ORDEN_DE_GRUPO }));
}
