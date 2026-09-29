"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/components/ui/cn";
import { claseControl } from "@/components/ui/field";
import { VOLUMEN_MAXIMO, VOLUMEN_MINIMO } from "@/lib/montaje";

/**
 * Volumen de una pista en la mezcla, de 0 % a 200 %. El dato viaja en tanto por uno (0–2, como lo guarda el
 * servidor) y se **muestra en por ciento**, que es en lo que piensa quien mueve el mando.
 *
 * Manecilla y campo numérico, los dos con el mismo valor: la manecilla para tantear y el número para escribir un
 * 100 % exacto. La manecilla es un `input type="range"`, así que el teclado ya funciona.
 */
export function ControlVolumen({
  etiqueta,
  ayuda,
  valor,
  deshabilitado,
  onCambio,
}: {
  etiqueta: string;
  ayuda?: ReactNode;
  /** Tanto por uno: 1 es el volumen original de la pista. */
  valor: number;
  deshabilitado?: boolean;
  onCambio: (valor: number) => void;
}) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const porCiento = Math.round(valor * 100);
  /** El campo se escribe en por ciento; lo que sale de aquí siempre es tanto por uno. */
  const desdePorCiento = (v: number) => (Number.isFinite(v) ? Math.round(v) / 100 : valor);

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-texto">
        {etiqueta}: <span className="font-mono">{porCiento} %</span>
      </label>
      <div className="flex items-center gap-3">
        <input
          type="range"
          id={id}
          min={VOLUMEN_MINIMO}
          max={VOLUMEN_MAXIMO}
          step={0.05}
          value={valor}
          disabled={deshabilitado}
          aria-describedby={ayuda ? idAyuda : undefined}
          aria-valuetext={`${porCiento} por ciento`}
          onChange={(e) => onCambio(e.target.valueAsNumber)}
          className="h-11 flex-1 accent-acento disabled:opacity-50"
        />
        <input
          type="number"
          min={VOLUMEN_MINIMO * 100}
          max={VOLUMEN_MAXIMO * 100}
          step={5}
          value={porCiento}
          disabled={deshabilitado}
          aria-label={`${etiqueta}, en por ciento`}
          onChange={(e) => onCambio(desdePorCiento(e.target.valueAsNumber))}
          className={cn(claseControl, "max-w-24 font-mono")}
        />
      </div>
      {ayuda && (
        <p id={idAyuda} className="text-sm text-texto-suave">
          {ayuda}
        </p>
      )}
    </div>
  );
}
