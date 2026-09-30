"use client";

import { useState } from "react";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { ListaOrdenable } from "@/components/ui/lista-ordenable";
import { type Capacidad, ETIQUETA_CAPACIDAD } from "@/lib/catalogo";
import type { PlantillaVista, VersionPlantilla } from "@/lib/presets";
import { historialPlantillaAccion, ordenarGrupoPlantillasAccion, type ResultadoPlantillas } from "./acciones";
import { DialogoPlantilla } from "./dialogo-plantilla";
import { TarjetaPlantilla } from "./tarjeta-plantilla";

/**
 * Plantillas de la instalación con su versión vigente, sus variables y su historial. El historial se pide al
 * desplegarlo, no al cargar la página: son cincuenta filas por plantilla como mucho, pero no hacen falta hasta
 * que alguien quiere verlas.
 */

export function VistaPlantillas({ inicial }: { inicial: PlantillaVista[] }) {
  const [plantillas, setPlantillas] = useState(inicial);
  const [historiales, setHistoriales] = useState<Record<string, VersionPlantilla[]>>({});
  const [abierto, setAbierto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const alCambiar = (resultado: ResultadoPlantillas) => {
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setPlantillas(resultado.plantillas);
    setHistoriales({});
    setAbierto(null);
    setError(null);
    setAviso("Guardado.");
  };

  const verHistorial = async (id: string) => {
    if (abierto === id) {
      setAbierto(null);
      return;
    }
    setAbierto(id);
    if (historiales[id]) return;
    const resultado = await historialPlantillaAccion(id);
    if (!resultado.ok) {
      setError(resultado.error);
      return;
    }
    setHistoriales((previos) => ({ ...previos, [id]: resultado.versiones }));
  };

  /** Orden completo de una capacidad. Devuelve el error, o `null` si se ha guardado (es lo que espera la lista). */
  const ordenar = async (capacidad: Capacidad, ids: string[]): Promise<string | null> => {
    const resultado = await ordenarGrupoPlantillasAccion(capacidad, ids);
    if (!resultado.ok) {
      setError(resultado.error);
      return resultado.error;
    }
    setPlantillas(resultado.plantillas);
    setError(null);
    setAviso("Orden guardado.");
    return null;
  };

  const capacidades = [...new Set(plantillas.map((p) => p.capacidad))];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <DialogoPlantilla onResultado={alCambiar} />
      </div>

      {aviso && <Aviso tono="correcto">{aviso}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}

      {plantillas.length === 0 && (
        <EstadoVacio
          nivel={2}
          titulo="Sin plantillas"
          texto="La semilla de la instalación no se ha aplicado todavía: ejecuta las migraciones."
        />
      )}

      {capacidades.map((capacidad) => {
        const grupo = plantillas.filter((p) => p.capacidad === capacidad);
        return (
          <section key={capacidad} aria-label={ETIQUETA_CAPACIDAD[capacidad]} className="flex flex-col gap-3">
            <h2 className="text-2xl font-bold text-texto">{ETIQUETA_CAPACIDAD[capacidad]}</h2>
            <ListaOrdenable
              etiquetaLista={`Plantillas de ${ETIQUETA_CAPACIDAD[capacidad]}`}
              className="flex flex-col gap-4"
              onOrden={(ids) => ordenar(capacidad, ids)}
              elementos={grupo.map((plantilla) => ({
                clave: plantilla.id,
                etiqueta: plantilla.nombre,
                contenido: (
                  <TarjetaPlantilla
                    plantilla={plantilla}
                    abierto={abierto === plantilla.id}
                    historial={historiales[plantilla.id] ?? []}
                    onHistorial={() => void verHistorial(plantilla.id)}
                    onResultado={alCambiar}
                  />
                ),
              }))}
            />
          </section>
        );
      })}
    </div>
  );
}
