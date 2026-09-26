"use client";

import { Combobox as C } from "@base-ui/react/combobox";
import { Check, X } from "lucide-react";
import { Fragment, useId } from "react";
import { cn } from "./cn";
import { claseItem, clasePopup, type Opcion } from "./options";

export interface SelectorMultipleProps {
  etiqueta: string;
  opciones: Opcion[];
  valor?: Opcion[];
  valorInicial?: Opcion[];
  onCambio?: (valor: Opcion[]) => void;
  marcador?: string;
  vacio?: string;
  className?: string;
}

/** Selección múltiple en caja: las opciones elegidas se muestran como chips y se puede buscar escribiendo. */
export function SelectorMultiple({
  etiqueta,
  opciones,
  valor,
  valorInicial,
  onCambio,
  marcador = "Escribe para buscar",
  vacio = "No hay coincidencias",
  className,
}: SelectorMultipleProps) {
  const id = useId();
  return (
    <C.Root
      items={opciones}
      multiple
      value={valor}
      defaultValue={valorInicial}
      onValueChange={(v) => onCambio?.(v as Opcion[])}
      itemToStringLabel={(o: Opcion) => o.label}
      isItemEqualToValue={(a: Opcion, b: Opcion) => a.value === b.value}
    >
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label htmlFor={id} className="text-sm font-semibold text-texto">
          {etiqueta}
        </label>
        <C.InputGroup className="flex min-h-11 w-full cursor-text flex-wrap items-center gap-1.5 rounded-control border border-borde bg-superficie px-2 py-1.5 transition-colors duration-(--motion-fast) focus-within:border-acento hover:border-acento">
          <C.Chips className="flex w-full flex-wrap items-center gap-1.5">
            <C.Value>
              {(elegidas: Opcion[]) => (
                <Fragment>
                  {elegidas.map((o) => (
                    <C.Chip
                      key={o.value}
                      aria-label={o.label}
                      className="flex items-center gap-1 rounded-full bg-elevada py-1 pr-1 pl-3 text-sm font-medium text-texto outline-none data-highlighted:bg-acento data-highlighted:text-sobre-acento"
                    >
                      {o.icono}
                      {o.label}
                      <C.ChipRemove
                        aria-label={`Quitar ${o.label}`}
                        className="flex size-6 items-center justify-center rounded-full hover:bg-borde/30"
                      >
                        <X className="size-3.5" />
                      </C.ChipRemove>
                    </C.Chip>
                  ))}
                  <C.Input
                    id={id}
                    placeholder={elegidas.length > 0 ? "" : marcador}
                    className="min-h-8 min-w-24 flex-1 bg-transparent px-1.5 text-base text-texto outline-none placeholder:text-texto-suave"
                  />
                </Fragment>
              )}
            </C.Value>
          </C.Chips>
        </C.InputGroup>
      </div>
      <C.Portal>
        <C.Positioner sideOffset={6} className="z-50 outline-none">
          <C.Popup className={clasePopup}>
            <C.Empty>
              <p className="px-3 py-2 text-sm text-texto-suave">{vacio}</p>
            </C.Empty>
            <C.List>
              {(o: Opcion) => (
                <C.Item key={o.value} value={o} disabled={o.deshabilitada} className={claseItem}>
                  <C.ItemIndicator className="text-acento">
                    <Check className="size-4" />
                  </C.ItemIndicator>
                  <span className="col-start-2 flex items-center gap-2">
                    {o.icono}
                    {o.label}
                  </span>
                </C.Item>
              )}
            </C.List>
          </C.Popup>
        </C.Positioner>
      </C.Portal>
    </C.Root>
  );
}
