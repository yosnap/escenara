"use client";

import { useState } from "react";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { ListaOrdenable } from "@/components/ui/lista-ordenable";
import { Selector } from "@/components/ui/select";
import { moverEnLista } from "@/lib/lista-ordenable";
import { CATEGORIAS_PRESET, type CategoriaPreset, ETIQUETA_CATEGORIA, type PresetVista } from "@/lib/presets";
import { ordenarGrupoPresetsAccion, type ResultadoPresets } from "./acciones";
import { DialogoPreset } from "./dialogo-preset";
import { TarjetaPreset } from "./tarjeta-preset";

/**
 * Catálogo de presets de la instalación, agrupado por categoría y ordenado como sale en la botonera de
 * «Crear». Desde aquí se dan de alta, se editan, se ordenan y se activan o desactivan.
 *
 * Los presets de cada usuario **no** se ven ni se editan desde aquí: son suyos. Lo que se ve es lo de la
 * instalación, que es lo que este panel puede cambiar.
 */

const TODAS = "todas";

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

  /** Orden completo de una categoría. Devuelve el error, o `null` si se ha guardado (es lo que espera la lista). */
  const ordenar = async (cat: CategoriaPreset, ids: string[]): Promise<string | null> => {
    const resultado = await ordenarGrupoPresetsAccion(cat, ids);
    if (!resultado.ok) {
      setError(resultado.error);
      return resultado.error;
    }
    setPresets(resultado.presets);
    setError(null);
    setAviso("Orden guardado.");
    return null;
  };

  /** Subir y bajar intercambian con la vecina y pasan por la misma acción que arrastrar. */
  const mover = async (preset: PresetVista, direccion: -1 | 1) => {
    const grupo = presets.filter((p) => p.categoria === preset.categoria).map((p) => p.id);
    const desde = grupo.indexOf(preset.id);
    const hasta = desde + direccion;
    if (hasta < 0 || hasta >= grupo.length) return;
    await ordenar(preset.categoria, moverEnLista(grupo, desde, hasta));
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
            <ListaOrdenable
              etiquetaLista={`Presets de ${ETIQUETA_CATEGORIA[cat]}`}
              className="flex flex-col gap-3"
              onOrden={(ids) => ordenar(cat, ids)}
              elementos={deLaCategoria.map((preset) => ({
                clave: preset.id,
                etiqueta: preset.nombre,
                contenido: (
                  <TarjetaPreset preset={preset} onMover={(d) => void mover(preset, d)} onResultado={alCambiar} />
                ),
              }))}
            />
          </section>
        );
      })}
    </div>
  );
}
