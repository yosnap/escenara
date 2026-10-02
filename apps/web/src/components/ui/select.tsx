"use client";

import { Select as S } from "@base-ui/react/select";
import { Check, ChevronsUpDown } from "lucide-react";
import { useId } from "react";
import { cn } from "./cn";
import { claseItem, clasePopup, type Opcion } from "./options";

export interface SelectorProps {
  etiqueta: string;
  opciones: Opcion[];
  valor?: string | null;
  valorInicial?: string | null;
  onCambio?: (valor: string | null) => void;
  marcador?: string;
  nombre?: string;
  deshabilitado?: boolean;
  className?: string;
  abiertoInicial?: boolean;
}

/** Selector de una opción. Sustituye siempre al `<select>` nativo del navegador. */
export function Selector({
  etiqueta,
  opciones,
  valor,
  valorInicial,
  onCambio,
  marcador = "Elige una opción",
  nombre,
  deshabilitado,
  className,
  abiertoInicial,
}: SelectorProps) {
  const porValor = new Map(opciones.map((o) => [o.value, o]));
  // Base UI une etiqueta y disparador al hidratar, y llama a la etiqueta como la raíz más «-label». Con el id de la
  // raíz fijado, el nombre del control está ya en el HTML del servidor.
  const idRaiz = useId();
  return (
    <S.Root
      id={idRaiz}
      value={valor}
      defaultValue={valorInicial}
      onValueChange={(v) => onCambio?.(v as string | null)}
      name={nombre}
      disabled={deshabilitado}
      defaultOpen={abiertoInicial}
    >
      <div className={cn("flex flex-col gap-1.5", className)}>
        <S.Label className="text-sm font-semibold text-texto">{etiqueta}</S.Label>
        <S.Trigger
          aria-labelledby={`${idRaiz}-label`}
          className="flex min-h-11 w-full items-center justify-between gap-3 rounded-control border border-borde bg-superficie px-3.5 py-2 text-left text-base text-texto transition-colors duration-(--motion-fast) hover:border-acento data-disabled:opacity-50 data-popup-open:border-acento"
        >
          <S.Value>
            {(v: string | null) => {
              const o = v ? porValor.get(v) : undefined;
              return o ? (
                <span className="flex items-center gap-2">
                  {o.icono}
                  {o.label}
                </span>
              ) : (
                <span className="text-texto-suave">{marcador}</span>
              );
            }}
          </S.Value>
          <S.Icon className="text-texto-suave">
            <ChevronsUpDown className="size-4" />
          </S.Icon>
        </S.Trigger>
      </div>
      <S.Portal>
        <S.Positioner sideOffset={6} alignItemWithTrigger={false} className="z-50 outline-none">
          <S.Popup className={clasePopup}>
            <S.List>
              {opciones.map((o) => (
                <S.Item key={o.value} value={o.value} disabled={o.deshabilitada} className={claseItem}>
                  <S.ItemIndicator className="text-acento">
                    <Check className="size-4" />
                  </S.ItemIndicator>
                  <S.ItemText className="col-start-2 flex flex-col">
                    <span className="flex items-center gap-2">
                      {o.icono}
                      {o.label}
                    </span>
                    {o.descripcion && <span className="text-sm font-normal text-texto-suave">{o.descripcion}</span>}
                  </S.ItemText>
                </S.Item>
              ))}
            </S.List>
          </S.Popup>
        </S.Positioner>
      </S.Portal>
    </S.Root>
  );
}
