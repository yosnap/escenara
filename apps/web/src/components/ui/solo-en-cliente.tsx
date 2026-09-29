"use client";

import { type ReactNode, useSyncExternalStore } from "react";

const sinSuscripcion = () => () => {};

/**
 * Pinta a sus hijos **solo en el navegador**: el HTML del servidor lleva la `reserva` y los hijos se crean después,
 * sin hidratar.
 *
 * Es para formularios que no ganan nada con pintarse en el servidor (los del panel de administración, tras el
 * login) y en los que una extensión —LastPass, sobre todo— inserta su icono junto a los campos antes de que React
 * hidrate: React 19 no tolera ni un nodo ajeno y rehace toda la página con un error recuperable. Sin campos en el
 * HTML del servidor no hay nada que decorar antes de hidratar, y una vez montados React no se queja de nodos que
 * no son suyos.
 */
export function SoloEnCliente({ children, reserva = null }: { children: ReactNode; reserva?: ReactNode }) {
  const enCliente = useSyncExternalStore(
    sinSuscripcion,
    () => true,
    () => false,
  );
  return enCliente ? children : reserva;
}
