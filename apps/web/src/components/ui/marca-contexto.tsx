"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { RolLogo } from "@/lib/marca-vista";

/**
 * Marca publicada de la instalación que necesitan los componentes del navegador: el nombre y las URL de los
 * logotipos. Sin marca publicada no hay proveedor y todo pinta la marca de Escenara, como siempre.
 */
export interface MarcaCliente {
  nombre: string;
  logos: Partial<Record<RolLogo, string>>;
}

const Contexto = createContext<MarcaCliente | null>(null);

export function ProveedorMarca({ valor, children }: { valor: MarcaCliente | null; children: ReactNode }) {
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export const useMarca = (): MarcaCliente | null => useContext(Contexto);
