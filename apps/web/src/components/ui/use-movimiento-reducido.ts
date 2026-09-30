"use client";

import { useSyncExternalStore } from "react";

/**
 * `true` si la persona ha pedido **reducir el movimiento** en su sistema, y se actualiza si lo cambia con la página
 * abierta. Es lo mismo que `useReducedMotion` de la librería de animación, sin cargarla: los componentes que solo
 * necesitan saber la preferencia (la lista ordenable, por ejemplo) no deben arrastrar 41 KB a cada pantalla.
 *
 * En el servidor devuelve `false`: el CSS global ya apaga las transiciones con `prefers-reduced-motion`, así que el
 * primer pintado no se mueve aunque el valor todavía no se sepa.
 */
const CONSULTA = "(prefers-reduced-motion: reduce)";

const suscribir = (avisar: () => void) => {
  const preferencia = window.matchMedia(CONSULTA);
  preferencia.addEventListener("change", avisar);
  return () => preferencia.removeEventListener("change", avisar);
};

export function useMovimientoReducido(): boolean {
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}
