"use client";

import { useEstrellasRepositorio } from "./repositorio-contexto";

/** Solo el número necesita contexto cliente; el enlace y sus iconos se pintan en servidor. */
export function EstrellasRepositorio({ estrellas }: { estrellas?: number | null }) {
  const compartidas = useEstrellasRepositorio();
  const recuento = (estrellas ?? compartidas)?.toLocaleString("es-ES");
  if (recuento === undefined) return null;
  return (
    <span className="tabular-nums">
      {recuento}
      <span className="sr-only"> estrellas</span>
    </span>
  );
}
