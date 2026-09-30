"use client";

import { Check } from "lucide-react";
import { cn } from "@/components/ui/cn";
import {
  ETIQUETA_FORMATO_MONTAJE,
  FORMATOS_MONTAJE,
  type FormatoMontaje,
  PLATAFORMA_DE_FORMATO,
  PROPORCION_DE_FORMATO,
} from "@/lib/formatos";

/**
 * Selectores de formato (0.41.0), con el **nombre de la plataforma y la proporción** (petición del propietario,
 * 2026-09-27): la gente sabe dónde va a publicar antes que qué proporción necesita.
 *
 * - `SelectorPlataforma`: uno solo, el principal. Un formato que no se puede generar con los modelos elegidos
 *   **sale deshabilitado con su motivo**, y el servidor lo rechaza igual si llegara por la API.
 * - `SelectorFormatos`: varios, los del montaje. El principal va siempre marcado; los demás se añaden o se quitan
 *   sin coste, porque salen del mismo clip con reencuadre.
 *
 * Sin `<select>` nativo (norma de la casa) y sin bordes laterales de color: la opción elegida se marca con el aro
 * completo y un icono, así que se distingue también sin color.
 */

/** Dibujo de la proporción: un rectángulo con la forma del formato. Es lo que se reconoce de un vistazo. */
function Silueta({ formato }: { formato: FormatoMontaje }) {
  const [ancho, alto] = PROPORCION_DE_FORMATO[formato].split(":").map(Number) as [number, number];
  const escala = 22 / Math.max(ancho, alto);
  return (
    <span aria-hidden className="flex size-7 shrink-0 items-center justify-center">
      <span
        className="rounded-[3px] border-2 border-current"
        style={{ width: `${ancho * escala}px`, height: `${alto * escala}px` }}
      />
    </span>
  );
}

export function SelectorPlataforma({
  etiqueta,
  valor,
  motivos,
  deshabilitado,
  formatos = FORMATOS_MONTAJE,
  onCambio,
}: {
  etiqueta: string;
  valor: FormatoMontaje;
  /** Por formato, por qué no se puede elegir; `null` o ausente si se puede. */
  motivos?: Partial<Record<FormatoMontaje, string | null>>;
  deshabilitado?: boolean;
  /** Formatos que se ofrecen, en su orden. */
  formatos?: readonly FormatoMontaje[];
  onCambio: (formato: FormatoMontaje) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2" disabled={deshabilitado}>
      <legend className="mb-1 text-sm font-semibold text-texto">{etiqueta}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {formatos.map((formato) => {
          const motivo = motivos?.[formato] ?? null;
          const elegido = formato === valor;
          return (
            <button
              key={formato}
              type="button"
              aria-pressed={elegido}
              disabled={motivo !== null && !elegido}
              onClick={() => onCambio(formato)}
              className={cn(
                "flex min-h-14 items-start gap-3 rounded-tarjeta border-2 p-3 text-left transition-colors duration-(--motion-fast) disabled:cursor-not-allowed disabled:opacity-60",
                elegido ? "border-acento bg-acento/10 text-texto" : "border-borde bg-superficie text-texto",
                motivo === null && !elegido && "hover:border-acento",
              )}
            >
              <Silueta formato={formato} />
              <span className="flex flex-1 flex-col gap-0.5">
                <span className="font-semibold">{PLATAFORMA_DE_FORMATO[formato]}</span>
                <span className="text-xs text-texto-suave">{motivo ?? ETIQUETA_FORMATO_MONTAJE[formato]}</span>
              </span>
              {elegido && <Check className="size-5 shrink-0 text-acento" aria-hidden />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SelectorFormatos({
  etiqueta,
  formatos,
  deshabilitado,
  onCambio,
}: {
  etiqueta: string;
  /** Formatos elegidos; el primero es el principal y no se puede quitar desde aquí. */
  formatos: readonly FormatoMontaje[];
  deshabilitado?: boolean;
  onCambio: (formatos: FormatoMontaje[]) => void;
}) {
  const principal = formatos[0];
  const alternar = (formato: FormatoMontaje) => {
    const siguientes = formatos.includes(formato)
      ? formatos.filter((f) => f !== formato)
      : // Se añade en el orden de siempre, detrás del principal: así las pestañas no bailan.
        [...formatos, formato].sort((a, b) =>
          a === principal ? -1 : b === principal ? 1 : FORMATOS_MONTAJE.indexOf(a) - FORMATOS_MONTAJE.indexOf(b),
        );
    onCambio(siguientes);
  };
  return (
    <fieldset className="flex flex-col gap-2" disabled={deshabilitado}>
      <legend className="mb-1 text-sm font-semibold text-texto">{etiqueta}</legend>
      <div className="flex flex-wrap gap-2">
        {FORMATOS_MONTAJE.map((formato) => {
          const esPrincipal = formato === principal;
          const marcado = formatos.includes(formato);
          return (
            <button
              key={formato}
              type="button"
              aria-pressed={marcado}
              disabled={esPrincipal}
              onClick={() => alternar(formato)}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-full border-2 px-3 text-sm font-semibold transition-colors duration-(--motion-fast)",
                marcado ? "border-acento bg-acento/10 text-texto" : "border-borde bg-superficie text-texto-suave",
                !esPrincipal && "hover:border-acento disabled:opacity-50",
                esPrincipal && "cursor-default",
              )}
            >
              <Silueta formato={formato} />
              {PLATAFORMA_DE_FORMATO[formato]}
              {esPrincipal ? (
                <span className="rounded-full bg-acento px-2 py-0.5 text-xs text-sobre-acento">Principal</span>
              ) : (
                marcado && <Check className="size-4 text-acento" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
