"use client";

import { FlipHorizontal2, FlipVertical2, RotateCcw, RotateCw, Undo2, ZoomIn } from "lucide-react";
import { Boton } from "../button";
import { cn } from "../cn";
import type { Orientacion } from "./lienzo";
import { PROPORCIONES, ZOOM } from "./transformaciones";

const claseOpcion =
  "min-h-10 rounded-full border border-borde px-3.5 text-sm font-semibold text-texto transition-colors duration-(--motion-fast) hover:border-acento aria-pressed:border-transparent aria-pressed:bg-acento aria-pressed:text-sobre-acento";

export function ControlesEditor({
  proporcion,
  onProporcion,
  orientacion,
  onGirar,
  onVoltear,
  zoom,
  onZoom,
  onRestablecer,
}: {
  proporcion: number | undefined;
  onProporcion: (valor: number | undefined) => void;
  orientacion: Orientacion;
  onGirar: (sentido: 1 | -1) => void;
  onVoltear: (eje: "volteoH" | "volteoV") => void;
  zoom: number;
  onZoom: (valor: number) => void;
  onRestablecer: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-texto">Proporción</legend>
        <div className="flex flex-wrap gap-2">
          {PROPORCIONES.map((p) => (
            <button
              key={p.etiqueta}
              type="button"
              aria-pressed={proporcion === p.valor}
              onClick={() => onProporcion(p.valor)}
              className={claseOpcion}
            >
              {p.etiqueta}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-texto">Girar y voltear</legend>
        <div className="flex flex-wrap gap-2">
          <Boton variante="secundario" tamano="sm" icono={<RotateCcw className="size-4" />} onClick={() => onGirar(-1)}>
            −90°
          </Boton>
          <Boton variante="secundario" tamano="sm" icono={<RotateCw className="size-4" />} onClick={() => onGirar(1)}>
            +90°
          </Boton>
          <button
            type="button"
            aria-pressed={orientacion.volteoH}
            onClick={() => onVoltear("volteoH")}
            className={cn(claseOpcion, "inline-flex items-center gap-1.5")}
          >
            <FlipHorizontal2 className="size-4" aria-hidden /> Horizontal
          </button>
          <button
            type="button"
            aria-pressed={orientacion.volteoV}
            onClick={() => onVoltear("volteoV")}
            className={cn(claseOpcion, "inline-flex items-center gap-1.5")}
          >
            <FlipVertical2 className="size-4" aria-hidden /> Vertical
          </button>
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="flex items-center justify-between text-sm font-semibold text-texto">
          <span className="inline-flex items-center gap-1.5">
            <ZoomIn className="size-4" aria-hidden /> Zoom
          </span>
          <span className="font-mono text-texto-suave">{zoom.toFixed(2)}×</span>
        </span>
        <input
          type="range"
          min={ZOOM.min}
          max={ZOOM.max}
          step={ZOOM.paso}
          value={zoom}
          onChange={(e) => onZoom(Number(e.target.value))}
          className="h-11 w-full accent-(--color-acento)"
        />
      </label>

      <Boton variante="fantasma" tamano="sm" icono={<Undo2 className="size-4" />} onClick={onRestablecer}>
        Restablecer cambios
      </Boton>
    </div>
  );
}
