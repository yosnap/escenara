"use client";

import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import type { ReactNode } from "react";
import { cn } from "../cn";

/**
 * **Elector visual** (0.25.1): una rejilla de tarjetas con pictograma, nombre y una frase llana de lo que verá
 * el espectador. Es lo que sustituye al desplegable donde la palabra sola no basta —plano, ángulo, movimiento de
 * cámara y momento del gesto—, porque «contrapicado» no dice nada si no has rodado nunca.
 *
 * Reglas de la casa que cumple:
 *
 * - **no es un `<select>` nativo** ni lo envuelve: es un grupo de radios con teclado y lector de pantalla;
 * - **sin bordes laterales de color**: la opción elegida se marca con el borde entero y un anillo, nunca con una
 *   franja a un lado;
 * - la descripción larga del catálogo sigue estando, debajo de la frase corta: quien administra la escribió y
 *   quitarla sería perder información suya.
 */

export interface OpcionVisual {
  valor: string;
  nombre: string;
  /** Frase llana de una línea: qué verá el espectador. Vacía si la opción no tiene una escrita. */
  frase: string;
  /** Descripción del catálogo, la que escribió quien administra. Opcional. */
  descripcion?: string;
  pictograma: ReactNode;
  /** Aviso corto que se enseña en la tarjeta: en la cámara, el nivel de riesgo. */
  etiqueta?: string;
}

export function ElectorVisual({
  etiqueta,
  ayuda,
  opciones,
  valor,
  deshabilitado,
  onCambio,
  className,
}: {
  etiqueta: string;
  ayuda?: string;
  opciones: OpcionVisual[];
  /** La opción elegida. Cadena vacía = ninguna, que en cada campo significa una cosa distinta. */
  valor: string;
  deshabilitado?: boolean;
  onCambio: (valor: string) => void;
  className?: string;
}) {
  return (
    <fieldset className={cn("flex flex-col gap-2", className)} disabled={deshabilitado}>
      <legend className="text-sm font-semibold text-texto">{etiqueta}</legend>
      {ayuda && <p className="text-sm text-texto-suave">{ayuda}</p>}
      <RadioGroup
        value={valor}
        onValueChange={(v) => onCambio(String(v ?? ""))}
        disabled={deshabilitado}
        className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3"
      >
        {opciones.map((o) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: Base UI renderiza el control dentro de la etiqueta
          <label
            key={o.valor}
            className={cn(
              "flex cursor-pointer items-start gap-3 rounded-tarjeta border p-3 transition-colors duration-(--motion-fast)",
              "hover:border-acento has-disabled:cursor-default has-disabled:opacity-50",
              valor === o.valor ? "border-acento bg-elevada ring-2 ring-acento/35" : "border-borde bg-superficie",
            )}
          >
            <Radio.Root
              value={o.valor}
              className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-borde bg-superficie data-checked:border-acento"
            >
              <Radio.Indicator className="size-2.5 rounded-full bg-acento data-unchecked:hidden" />
            </Radio.Root>
            <span className="text-texto">{o.pictograma}</span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex flex-wrap items-center gap-2 font-semibold text-texto">
                {o.nombre}
                {o.etiqueta && (
                  <span className="rounded-full bg-elevada px-2 py-0.5 text-xs font-medium text-texto-suave">
                    {o.etiqueta}
                  </span>
                )}
              </span>
              {o.frase && <span className="text-sm text-texto-suave">{o.frase}</span>}
              {o.descripcion && o.descripcion !== o.frase && (
                <span className="text-sm text-texto-suave/80">{o.descripcion}</span>
              )}
            </span>
          </label>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
