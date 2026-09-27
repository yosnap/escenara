"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { Selector } from "@/components/ui/select";
import { CATEGORIAS_PRESET, type CategoriaPreset, ETIQUETA_CATEGORIA, type PresetVista } from "@/lib/presets";
import { activarPresetAccion, ordenarPresetAccion, type ResultadoPresets } from "./acciones";
import { DialogoPreset } from "./dialogo-preset";

/**
 * Catálogo de presets de la instalación, agrupado por categoría y ordenado como sale en la botonera de
 * «Crear». Desde aquí se dan de alta, se editan, se ordenan y se activan o desactivan.
 *
 * Los presets de cada usuario **no** se ven ni se editan desde aquí: son suyos. Lo que se ve es lo de la
 * instalación, que es lo que este panel puede cambiar.
 */

const TODAS = "todas";

/** Paso con el que los botones «subir» y «bajar» mueven un preset dentro de su categoría. */
const PASO_ORDEN = 10;

export function VistaPresets({ inicial }: { inicial: PresetVista[] }) {
  const [presets, setPresets] = useState(inicial);
  const [categoria, setCategoria] = useState<string>(TODAS);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alCambiar = (resultado: ResultadoPresets) => {
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setPresets(resultado.presets);
    setError(null);
    setAviso("Guardado.");
  };

  const mover = async (preset: PresetVista, direccion: -1 | 1) => {
    alCambiar(await ordenarPresetAccion(preset.id, Math.max(0, preset.orden + direccion * PASO_ORDEN)));
  };

  const visibles = CATEGORIAS_PRESET.filter((c) => categoria === TODAS || c === categoria);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Selector
          etiqueta="Categoría"
          valor={categoria}
          onCambio={(v) => setCategoria(v ?? TODAS)}
          className="max-w-xs"
          opciones={[
            { value: TODAS, label: "Todas las categorías" },
            ...CATEGORIAS_PRESET.map((c) => ({ value: c, label: ETIQUETA_CATEGORIA[c] })),
          ]}
        />
        <DialogoPreset
          categoriaInicial={categoria === TODAS ? undefined : (categoria as CategoriaPreset)}
          onResultado={alCambiar}
        />
      </div>

      {aviso && <Aviso tono="correcto">{aviso}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}

      {presets.length === 0 && (
        <EstadoVacio
          titulo="Sin presets"
          texto="La semilla de la instalación no se ha aplicado todavía: ejecuta las migraciones."
        />
      )}

      {visibles.map((cat) => {
        const deLaCategoria = presets.filter((p) => p.categoria === cat);
        if (deLaCategoria.length === 0) return null;
        return (
          <section key={cat} aria-label={ETIQUETA_CATEGORIA[cat]} className="flex flex-col gap-3">
            <h2 className="text-2xl font-bold text-texto">{ETIQUETA_CATEGORIA[cat]}</h2>
            <ul className="flex flex-col gap-3">
              {deLaCategoria.map((preset) => (
                <li
                  key={preset.id}
                  className="flex flex-wrap items-start justify-between gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-4"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <strong className="text-lg font-bold text-texto">{preset.nombre}</strong>
                      <span className="font-mono text-sm text-texto-suave">{preset.clave}</span>
                      {!preset.activo && (
                        <span className="rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-error">
                          Desactivado
                        </span>
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
                    <span className="font-mono text-sm text-texto-suave">#{preset.orden}</span>
                    <Boton variante="fantasma" tamano="sm" onClick={() => void mover(preset, -1)}>
                      Subir
                    </Boton>
                    <Boton variante="fantasma" tamano="sm" onClick={() => void mover(preset, 1)}>
                      Bajar
                    </Boton>
                    <DialogoPreset preset={preset} onResultado={alCambiar} />
                    <Boton
                      variante={preset.activo ? "secundario" : "primario"}
                      tamano="sm"
                      onClick={async () => alCambiar(await activarPresetAccion(preset.id, !preset.activo))}
                    >
                      {preset.activo ? "Desactivar" : "Activar"}
                    </Boton>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
