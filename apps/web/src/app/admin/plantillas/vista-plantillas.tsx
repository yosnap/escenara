"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { ETIQUETA_CAPACIDAD } from "@/lib/catalogo";
import { ETIQUETA_CATEGORIA, ETIQUETA_TIPO_VARIABLE, type PlantillaVista, type VersionPlantilla } from "@/lib/presets";
import {
  activarPlantillaAccion,
  historialPlantillaAccion,
  ordenarPlantillaAccion,
  type ResultadoPlantillas,
} from "./acciones";
import { DialogoPlantilla } from "./dialogo-plantilla";

/**
 * Plantillas de la instalación con su versión vigente, sus variables y su historial. El historial se pide al
 * desplegarlo, no al cargar la página: son cincuenta filas por plantilla como mucho, pero no hacen falta hasta
 * que alguien quiere verlas.
 */

const PASO_ORDEN = 10;

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

  const mover = async (plantilla: PlantillaVista, direccion: -1 | 1) => {
    alCambiar(await ordenarPlantillaAccion(plantilla.id, Math.max(0, plantilla.orden + direccion * PASO_ORDEN)));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <DialogoPlantilla onResultado={alCambiar} />
      </div>

      {aviso && <Aviso tono="correcto">{aviso}</Aviso>}
      {error && <Aviso tono="error">{error}</Aviso>}

      {plantillas.length === 0 && (
        <EstadoVacio
          titulo="Sin plantillas"
          texto="La semilla de la instalación no se ha aplicado todavía: ejecuta las migraciones."
        />
      )}

      <ul className="flex flex-col gap-4">
        {plantillas.map((plantilla) => (
          <li
            key={plantilla.id}
            className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <p className="flex flex-wrap items-center gap-2">
                  <strong className="text-lg font-bold text-texto">{plantilla.nombre}</strong>
                  <span className="font-mono text-sm text-texto-suave">{plantilla.clave}</span>
                  <span className="rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-texto">
                    Versión {plantilla.version}
                  </span>
                  {!plantilla.activa && (
                    <span className="rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-error">
                      Desactivada
                    </span>
                  )}
                </p>
                <p className="text-texto-suave">{plantilla.descripcion}</p>
                <p className="text-sm text-texto-suave">
                  {ETIQUETA_CAPACIDAD[plantilla.capacidad]} · orden #{plantilla.orden}
                  {plantilla.restricciones.minimoReferencias > 0
                    ? ` · exige ${plantilla.restricciones.minimoReferencias} foto(s) de referencia`
                    : ""}
                  {plantilla.restricciones.modelos.length > 0
                    ? ` · solo ${plantilla.restricciones.modelos.join(", ")}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Boton variante="fantasma" tamano="sm" onClick={() => void mover(plantilla, -1)}>
                  Subir
                </Boton>
                <Boton variante="fantasma" tamano="sm" onClick={() => void mover(plantilla, 1)}>
                  Bajar
                </Boton>
                <DialogoPlantilla plantilla={plantilla} onResultado={alCambiar} />
                <Boton
                  variante={plantilla.activa ? "secundario" : "primario"}
                  tamano="sm"
                  onClick={async () => alCambiar(await activarPlantillaAccion(plantilla.id, !plantilla.activa))}
                >
                  {plantilla.activa ? "Desactivar" : "Activar"}
                </Boton>
              </div>
            </div>

            <pre className="overflow-x-auto whitespace-pre-wrap rounded-control bg-elevada p-3 font-mono text-sm text-texto">
              {plantilla.plantilla}
            </pre>

            <ul className="flex flex-wrap gap-2">
              {plantilla.variables.map((variable) => (
                <li
                  key={variable.nombre}
                  className="rounded-full bg-elevada px-3 py-1 text-sm text-texto"
                  title={ETIQUETA_TIPO_VARIABLE[variable.tipo]}
                >
                  <span className="font-mono">{variable.nombre}</span>
                  <span className="text-texto-suave">
                    {" "}
                    ·{" "}
                    {variable.categoria
                      ? ETIQUETA_CATEGORIA[variable.categoria]
                      : ETIQUETA_TIPO_VARIABLE[variable.tipo]}
                    {variable.obligatoria ? " · obligatoria" : ""}
                  </span>
                </li>
              ))}
            </ul>

            <Boton
              variante="fantasma"
              tamano="sm"
              className="self-start"
              onClick={() => void verHistorial(plantilla.id)}
            >
              {abierto === plantilla.id ? "Ocultar versiones" : "Ver versiones"}
            </Boton>

            {abierto === plantilla.id && (
              <ol className="flex flex-col gap-2">
                {(historiales[plantilla.id] ?? []).map((version) => (
                  <li key={version.id} className="rounded-control bg-elevada p-3">
                    <p className="font-semibold text-texto">
                      Versión {version.numero} · {new Date(version.creadoEn).toLocaleString("es-ES")}
                    </p>
                    <p className="text-texto-suave">{version.motivo}</p>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-sm text-texto">
                      {version.plantilla}
                    </pre>
                  </li>
                ))}
              </ol>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
