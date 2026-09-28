"use client";

import { ScanFace } from "lucide-react";
import { Boton } from "@/components/ui/button";
import type { IdentidadReferencia } from "@/lib/captura-personaje";

/**
 * Estado de la comprobación de identidad de una **vista generada** (0.24.0): si es la misma persona que la cara
 * de referencia del personaje.
 *
 * Se enseña siempre con su motivo, nunca como un sello verde a secas: el usuario tiene que poder discutir el
 * veredicto, y para eso necesita saber en qué se basó. `sin_comprobar` se dice tal cual y **no** como sospecha:
 * es el estado de todo lo que se generó antes de esta versión.
 */

const TONO: Record<IdentidadReferencia, string> = {
  sin_comprobar: "text-texto-suave",
  pasa: "text-correcto",
  revisar: "text-aviso",
  no_pasa: "text-error",
};

const TITULO: Record<IdentidadReferencia, string> = {
  sin_comprobar: "Parecido sin comprobar",
  pasa: "Es la misma persona",
  revisar: "Mírala tú",
  no_pasa: "No parece la misma persona",
};

/** Qué significa el veredicto **para la cobertura**, que es lo que de verdad cambia. */
const EFECTO: Record<IdentidadReferencia, string> = {
  sin_comprobar: "Mientras no se compruebe, no cuenta como foto de referencia.",
  pasa: "Cuenta como foto de referencia de esa vista.",
  revisar: "La confianza no llega al umbral de esta instalación, así que no cuenta todavía.",
  no_pasa: "No cuenta como foto de referencia y no conviene usarla para guiar.",
};

export function EstadoIdentidad({
  identidad,
  motivo,
  inventado,
  ocupado,
  onComprobar,
}: {
  identidad: IdentidadReferencia;
  motivo: string;
  /** En un personaje inventado su cara **es** la generada: el veredicto informa, pero no le quita la cobertura. */
  inventado: boolean;
  ocupado?: boolean;
  onComprobar: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className={`text-xs font-bold ${TONO[identidad]}`}>{TITULO[identidad]}</p>
      <p className="text-xs text-texto-suave">
        {inventado ? "Es un personaje inventado: sus imágenes cuentan igualmente." : EFECTO[identidad]}
      </p>
      {motivo !== "" && <p className="text-xs text-texto-suave">{motivo}</p>}
      <Boton variante="secundario" tamano="sm" disabled={ocupado} onClick={onComprobar} className="self-start">
        <ScanFace className="size-4" />
        {identidad === "sin_comprobar" ? "Comprobar el parecido" : "Volver a comprobar"}
      </Boton>
    </div>
  );
}
