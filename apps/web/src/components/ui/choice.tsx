"use client";

import { Checkbox as CB } from "@base-ui/react/checkbox";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Switch as SW } from "@base-ui/react/switch";
import { Check } from "lucide-react";
import { type ReactNode, useId } from "react";
import { cn } from "./cn";

interface BaseProps {
  etiqueta: ReactNode;
  descripcion?: ReactNode;
  deshabilitado?: boolean;
}

function Texto({ etiqueta, descripcion }: { etiqueta: ReactNode; descripcion?: ReactNode }) {
  return (
    <span className="flex flex-col">
      <span className="text-base text-texto">{etiqueta}</span>
      {descripcion && <span className="text-sm text-texto-suave">{descripcion}</span>}
    </span>
  );
}

export function Casilla({
  etiqueta,
  descripcion,
  deshabilitado,
  marcada,
  marcadaInicial,
  onCambio,
  error,
  requisito,
  describidaPor,
}: BaseProps & {
  marcada?: boolean;
  marcadaInicial?: boolean;
  onCambio?: (v: boolean) => void;
  /** Lo que falta de esta casilla: la marca con un aro de error completo y lo dice debajo. */
  error?: string;
  /** Marca de la casilla para llegar a ella desde un aviso de requisitos (`data-requisito`). */
  requisito?: string;
  /** Id de un texto de fuera que también describe la casilla (por ejemplo, el motivo de que esté desactivada). */
  describidaPor?: string;
}) {
  const idError = useId();
  const casilla = (
    // biome-ignore lint/a11y/noLabelWithoutControl: Base UI renderiza el control dentro de la etiqueta
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-start gap-3 py-1",
        deshabilitado && "opacity-50",
        error && "rounded-control px-2 ring-2 ring-error",
      )}
    >
      <CB.Root
        checked={marcada}
        defaultChecked={marcadaInicial}
        onCheckedChange={(v) => onCambio?.(v)}
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        aria-describedby={[error ? idError : "", describidaPor ?? ""].filter(Boolean).join(" ") || undefined}
        className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 border-borde bg-superficie transition-colors duration-(--motion-fast) data-checked:border-acento data-checked:bg-acento aria-invalid:border-error"
      >
        <CB.Indicator className="text-sobre-acento data-unchecked:hidden">
          <Check className="size-4" strokeWidth={3} />
        </CB.Indicator>
      </CB.Root>
      <Texto etiqueta={etiqueta} descripcion={descripcion} />
    </label>
  );
  // Sin marca ni error es la etiqueta de siempre: el envoltorio solo aparece cuando hay algo que señalar.
  if (!error && !requisito) return casilla;
  return (
    <div className="flex flex-col gap-1" data-requisito={requisito}>
      {casilla}
      {error && (
        <p id={idError} className="flex items-center gap-1 px-2 text-sm font-medium text-error">
          <span aria-hidden>●</span> {error}
        </p>
      )}
    </div>
  );
}

export function Interruptor({
  etiqueta,
  descripcion,
  deshabilitado,
  activo,
  activoInicial,
  onCambio,
}: BaseProps & { activo?: boolean; activoInicial?: boolean; onCambio?: (v: boolean) => void }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: Base UI renderiza el control dentro de la etiqueta
    <label
      className={cn("flex min-h-11 cursor-pointer items-center justify-between gap-4", deshabilitado && "opacity-50")}
    >
      <Texto etiqueta={etiqueta} descripcion={descripcion} />
      <SW.Root
        checked={activo}
        defaultChecked={activoInicial}
        onCheckedChange={(v) => onCambio?.(v)}
        disabled={deshabilitado}
        className="relative flex h-7 w-12 shrink-0 rounded-full border border-borde bg-elevada p-0.5 transition-colors duration-(--motion-base) data-checked:border-transparent data-checked:bg-degradado-foco"
      >
        <SW.Thumb className="size-5.5 rounded-full bg-superficie shadow-md transition-transform duration-(--motion-base) data-checked:translate-x-5" />
      </SW.Root>
    </label>
  );
}

export interface OpcionRadio {
  value: string;
  etiqueta: ReactNode;
  descripcion?: ReactNode;
}

export function GrupoOpciones({
  etiqueta,
  opciones,
  valor,
  valorInicial,
  onCambio,
}: {
  etiqueta: string;
  opciones: OpcionRadio[];
  valor?: string;
  valorInicial?: string;
  onCambio?: (v: string) => void;
}) {
  return (
    <RadioGroup
      value={valor}
      defaultValue={valorInicial}
      onValueChange={(v) => onCambio?.(v as string)}
      aria-label={etiqueta}
      className="flex flex-col gap-1"
    >
      <span className="mb-1 text-sm font-semibold text-texto">{etiqueta}</span>
      {opciones.map((o) => (
        // biome-ignore lint/a11y/noLabelWithoutControl: Base UI renderiza el control dentro de la etiqueta
        <label key={o.value} className="flex min-h-11 cursor-pointer items-start gap-3 py-1">
          <Radio.Root
            value={o.value}
            className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-borde bg-superficie data-checked:border-acento"
          >
            <Radio.Indicator className="size-3 rounded-full bg-acento data-unchecked:hidden" />
          </Radio.Root>
          <Texto etiqueta={o.etiqueta} descripcion={o.descripcion} />
        </label>
      ))}
    </RadioGroup>
  );
}
