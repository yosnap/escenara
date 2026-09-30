"use client";

import { createContext, useContext } from "react";

/**
 * Lo que un flujo por pasos deja hacer a lo que tiene dentro: saber en qué paso está, ir a otro y, si ese paso está
 * bloqueado, decir por qué en lugar de saltarse el candado. Vive aparte de `multipaso.tsx` para que una alerta pueda
 * llevar a su problema sin depender del componente que pinta la barra.
 */
export interface NavegacionDePasos {
  actual: string;
  ir: (paso: string) => void;
  estaBloqueado: (paso: string) => boolean;
  avisar: (paso: string) => void;
}

export const ContextoPasos = createContext<NavegacionDePasos | null>(null);

/** La navegación del flujo que contiene al componente, o `null` fuera de un flujo por pasos. */
export const useNavegacionDePasos = () => useContext(ContextoPasos);
