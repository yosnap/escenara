import { useRef } from "react";
import type { ModeloElegible } from "@/lib/catalogo";
import type { Medio } from "@/lib/media/tipos";

/**
 * Lo que decide qué pasa con el modelo del fotograma al cambiar el sujeto (personaje o imagen suelta) en «Crear».
 *
 * El modelo que se había elegido **se conserva** mientras siga en la lista del modo nuevo (con imagen de partida o
 * sin ella); solo si no existe allí se deja que el servidor ponga su predeterminado. Y si el sujeto no cambia (pulsar
 * otra vez «Sin personaje»), no se pide nada.
 */

/** El modelo actual si vale en el modo nuevo; `undefined` deja que el servidor elija su predeterminado. */
export const modeloQueSigue = (modelo: string, modelos: readonly ModeloElegible[]): string | undefined =>
  modelos.some((m) => m.modelo === modelo) ? modelo : undefined;

/** Las dos selecciones de imagen son las mismas (mismos medios en el mismo orden). */
export const mismosMedios = (a: readonly Medio[], b: readonly Medio[]): boolean =>
  a.length === b.length && a.every((medio, i) => medio.id === b[i]?.id);

/**
 * Turnos de las peticiones que fijan la estimación del fotograma. Cada acción (cambiar el sujeto o elegir modelo)
 * abre un turno y recibe una función que dice si sigue siendo el último: una respuesta lenta de una acción anterior
 * se descarta en lugar de pisar lo elegido después. Es la misma idea que `clipVigente` para el clip.
 */
export function useTurnoVigente(): () => () => boolean {
  const ultimo = useRef(0);
  return () => {
    const turno = ++ultimo.current;
    return () => ultimo.current === turno;
  };
}
