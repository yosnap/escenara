"use client";

import { type ComponentType, useId, useState } from "react";
import { cn } from "@/components/ui/cn";
import type { SelectorProps } from "@/components/ui/select";

/** Descarga el selector completo al abrirlo; mantiene nombre y valor en el formulario mientras tanto. */
export function SelectorAdmin(props: SelectorProps) {
  const id = useId();
  const [Selector, setSelector] = useState<ComponentType<SelectorProps> | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(false);
  if (Selector) return <Selector {...props} abiertoInicial />;
  const valor = props.valor ?? props.valorInicial ?? "";
  return (
    <div className={cn("flex w-full min-w-0 flex-col gap-1.5 sm:w-56", props.className)}>
      <span id={id} className="text-sm font-semibold">
        {props.etiqueta}
      </span>
      {props.nombre && <input type="hidden" name={props.nombre} value={valor} disabled={props.deshabilitado} />}
      <button
        type="button"
        role="combobox"
        aria-labelledby={id}
        aria-expanded={false}
        aria-haspopup="listbox"
        aria-busy={cargando}
        disabled={props.deshabilitado || cargando}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control border border-borde bg-superficie px-3.5 py-2 text-left break-words"
        onKeyDown={(evento) => {
          if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
            evento.preventDefault();
            evento.currentTarget.click();
          }
        }}
        onClick={async () => {
          setCargando(true);
          setFallo(false);
          try {
            const modulo = await import("@/components/ui/select");
            setSelector(() => modulo.Selector);
          } catch {
            setFallo(true);
          } finally {
            setCargando(false);
          }
        }}
      >
        <span>
          {cargando
            ? "Abriendo…"
            : (props.opciones.find((o) => o.value === valor)?.label ?? props.marcador ?? "Elige una opción")}
        </span>
        <svg
          aria-hidden
          className="size-4 shrink-0 text-texto-suave"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {fallo && <p className="text-sm">No se pudo abrir. Vuelve a pulsar para reintentarlo.</p>}
    </div>
  );
}
