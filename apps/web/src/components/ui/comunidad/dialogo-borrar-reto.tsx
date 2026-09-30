"use client";

import { useState } from "react";
import type { RetoVista } from "@/lib/comunidad";
import { Alerta } from "../alerta";
import { Boton } from "../button";
import { Dialogo } from "../overlay";
import { borrarReto } from "./api-comunidad";

/** Borrar un reto: sus participaciones siguen publicadas, sin reto. */
export function DialogoBorrarReto({
  reto,
  onCerrar,
  onBorrado,
}: {
  reto: RetoVista;
  onCerrar: () => void;
  onBorrado: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const borrar = async () => {
    setOcupado(true);
    setError(null);
    const r = await borrarReto(reto.id);
    setOcupado(false);
    if (!r.ok) return setError(r.error);
    onBorrado();
  };
  return (
    <Dialogo
      titulo="Borrar el reto"
      descripcion="Sus participaciones siguen publicadas, sin reto."
      abierto
      onAbiertoCambio={(v) => !v && onCerrar()}
      pie={
        <Boton variante="peligro" cargando={ocupado} onClick={() => void borrar()}>
          Borrar «{reto.titulo}»
        </Boton>
      }
    >
      {error && (
        <Alerta tipo="error" titulo="No se ha borrado el reto">
          {error}
        </Alerta>
      )}
    </Dialogo>
  );
}
