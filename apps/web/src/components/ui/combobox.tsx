"use client";

import { Combobox as C } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { useId } from "react";
import { cn } from "./cn";
import { claseControl, SIN_GESTOR_CONTRASENAS } from "./field";
import { claseItem, clasePopup, type Opcion } from "./options";

export interface BuscadorProps {
  etiqueta: string;
  opciones: Opcion[];
  valor?: Opcion | null;
  valorInicial?: Opcion | null;
  onCambio?: (valor: Opcion | null) => void;
  marcador?: string;
  vacio?: string;
  className?: string;
}

/** Selección única con búsqueda, para listas largas (idiomas, plantillas, modelos). */
export function Buscador({
  etiqueta,
  opciones,
  valor,
  valorInicial,
  onCambio,
  marcador = "Escribe para buscar",
  vacio = "No hay coincidencias",
  className,
}: BuscadorProps) {
  const id = useId();
  return (
    <C.Root
      items={opciones}
      value={valor}
      defaultValue={valorInicial}
      onValueChange={(v) => onCambio?.(v as Opcion | null)}
      itemToStringLabel={(o: Opcion) => o.label}
      isItemEqualToValue={(a: Opcion, b: Opcion) => a.value === b.value}
    >
      <div className={cn("flex flex-col gap-1.5", className)}>
        <label htmlFor={id} className="text-sm font-semibold text-texto">
          {etiqueta}
        </label>
        <C.InputGroup className="relative flex items-center">
          <C.Input
            id={id}
            placeholder={marcador}
            className={cn(claseControl, "min-h-11 pr-20")}
            {...SIN_GESTOR_CONTRASENAS}
          />
          <div className="absolute right-1.5 flex items-center gap-0.5 text-texto-suave">
            <C.Clear
              aria-label="Borrar selección"
              className="flex size-8 items-center justify-center rounded-full hover:bg-elevada"
            >
              <X className="size-4" />
            </C.Clear>
            <C.Trigger
              aria-label="Abrir opciones"
              className="flex size-8 items-center justify-center rounded-full hover:bg-elevada"
            >
              <ChevronsUpDown className="size-4" />
            </C.Trigger>
          </div>
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
                  <span className="col-start-2 flex flex-col">
                    <span className="flex items-center gap-2">
                      {o.icono}
                      {o.label}
                    </span>
                    {o.descripcion && <span className="text-sm text-texto-suave">{o.descripcion}</span>}
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
