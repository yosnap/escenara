"use client";

import { Crosshair } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { Aviso } from "@/components/ui/feedback";
import {
  avisoDeRecorte,
  type Encuadre,
  encuadreAutomatico,
  type FormatoMontaje,
  mismoEncuadre,
  PRESETS_ENCUADRE,
} from "@/lib/formatos";

/**
 * Ajuste del encuadre de una escena en un formato: los atajos (centrado, a un lado, arriba, abajo o entero con
 * bandas), la posición en cifras y el aviso cuando el recorte deja fuera más de la mitad del plano.
 *
 * El arrastre vive en el marco (`previsualizacion-formato.tsx`); este control es su alternativa sin ratón y la
 * forma de volver a lo automático. Cambiar el encuadre **no regenera nada**: solo dice qué parte del mismo clip
 * entra en ese formato, y se guarda con el montaje.
 */
export function ControlEncuadre({
  formato,
  encuadre,
  ajustado,
  medidas,
  deshabilitado,
  onCambio,
}: {
  formato: FormatoMontaje;
  /** El encuadre con el que se montaría ahora (el guardado o el automático). */
  encuadre: Encuadre;
  /** `true` si es uno elegido por el usuario y no el automático. */
  ajustado: boolean;
  medidas: { ancho: number | null; alto: number | null };
  deshabilitado?: boolean;
  onCambio: (encuadre: Encuadre) => void;
}) {
  const aviso = avisoDeRecorte(encuadre, medidas, formato);
  return (
    <div className="flex flex-col gap-2">
      <fieldset className="flex flex-wrap gap-1" disabled={deshabilitado}>
        <legend className="sr-only">Encuadre</legend>
        {PRESETS_ENCUADRE.map((preset) => {
          const elegido = mismoEncuadre(preset.encuadre, encuadre);
          return (
            <button
              key={preset.clave}
              type="button"
              aria-pressed={elegido}
              onClick={() => onCambio(preset.encuadre)}
              className={cn(
                "min-h-9 rounded-full border-2 px-3 text-xs font-semibold transition-colors duration-(--motion-fast) disabled:opacity-50",
                elegido
                  ? "border-acento bg-acento text-sobre-acento"
                  : "border-borde bg-superficie text-texto hover:border-acento",
              )}
            >
              {preset.etiqueta}
            </button>
          );
        })}
      </fieldset>
      <p className="flex flex-wrap items-center gap-2 text-xs text-texto-suave">
        <Crosshair className="size-3.5" aria-hidden />
        {encuadre.modo === "bandas"
          ? "Entero, con bandas negras donde no llega."
          : `Horizontal ${encuadre.x} % · vertical ${encuadre.y} %. Arrastra el vídeo o, con el foco en él, muévelo con las flechas.`}
        {ajustado ? (
          <button
            type="button"
            disabled={deshabilitado}
            className="min-h-6 rounded-control px-1 font-semibold text-acento hover:underline disabled:opacity-50"
            onClick={() => onCambio(encuadreAutomatico(formato))}
          >
            Volver a automático
          </button>
        ) : (
          <span>(automático)</span>
        )}
      </p>
      {aviso && <Aviso tono="aviso">{aviso}</Aviso>}
    </div>
  );
}
