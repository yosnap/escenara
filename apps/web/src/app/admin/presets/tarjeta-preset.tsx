"use client";

import { Boton } from "@/components/ui/button";
import type { PresetVista } from "@/lib/presets";
import { activarPresetAccion, type ResultadoPresets } from "./acciones";
import { DialogoPreset } from "./dialogo-preset";

/** Un preset de la instalación con sus acciones. Subir y bajar son la alternativa a arrastrar. */
export function TarjetaPreset({
  preset,
  onMover,
  onResultado,
}: {
  preset: PresetVista;
  /** Intercambia con la vecina: -1 sube, 1 baja. */
  onMover: (direccion: -1 | 1) => void;
  onResultado: (resultado: ResultadoPresets) => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex flex-wrap items-center gap-2">
          <strong className="text-lg font-bold text-texto">{preset.nombre}</strong>
          <span className="font-mono text-sm text-texto-suave">{preset.clave}</span>
          {!preset.activo && (
            // alerta-permitida: insignia de estado del preset
            <span className="rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-error">Desactivado</span>
          )}
        </p>
        <p className="text-texto-suave">{preset.descripcion}</p>
        <p className="font-mono text-sm text-texto">{preset.valores.prompt}</p>
        {preset.valores.proporcion && (
          <p className="text-sm text-texto-suave">Exige proporción {preset.valores.proporcion}.</p>
        )}
        {preset.valores.segundos !== undefined && (
          <p className="text-sm text-texto-suave">Exige {preset.valores.segundos} s de clip.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Boton variante="fantasma" tamano="sm" aria-label={`Subir ${preset.nombre}`} onClick={() => onMover(-1)}>
          Subir
        </Boton>
        <Boton variante="fantasma" tamano="sm" aria-label={`Bajar ${preset.nombre}`} onClick={() => onMover(1)}>
          Bajar
        </Boton>
        <DialogoPreset preset={preset} onResultado={onResultado} />
        <Boton
          variante={preset.activo ? "secundario" : "primario"}
          tamano="sm"
          onClick={async () => onResultado(await activarPresetAccion(preset.id, !preset.activo))}
        >
          {preset.activo ? "Desactivar" : "Activar"}
        </Boton>
      </div>
    </div>
  );
}
