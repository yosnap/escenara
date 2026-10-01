"use client";

import { createContext, type ReactNode, useContext } from "react";

const Contexto = createContext<number | null>(null);

/** El layout comparte el dato público obtenido en servidor con todas las cabeceras. */
export function ProveedorRepositorio({ estrellas, children }: { estrellas: number | null; children: ReactNode }) {
  return <Contexto.Provider value={estrellas}>{children}</Contexto.Provider>;
}

export const useEstrellasRepositorio = () => useContext(Contexto);
