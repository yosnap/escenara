/**
 * Aplica `fn` a cada elemento con **como mucho `maximo` a la vez**, conservando el orden del resultado. Lo usan la cola
 * de moderación y la lista de candidatos: cada elemento abre una transacción, y el proceso web tiene un grupo pequeño de
 * conexiones que comparten todas las demás peticiones.
 */
export async function conConcurrencia<T, R>(
  elementos: readonly T[],
  maximo: number,
  fn: (elemento: T) => Promise<R>,
): Promise<R[]> {
  const salida: R[] = new Array(elementos.length);
  let siguiente = 0;
  const trabajador = async () => {
    for (;;) {
      const i = siguiente++;
      if (i >= elementos.length) return;
      salida[i] = await fn(elementos[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(maximo, elementos.length)) }, trabajador));
  return salida;
}

/** Transacciones a la vez que abre una lista de la comunidad (de un grupo de 10 conexiones por proceso). */
export const CONCURRENCIA_COMUNIDAD = 4;
