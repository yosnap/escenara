"use client";

import { Boton } from "@/components/ui/button";
import { DemoDePlantilla } from "@/components/ui/demo-plantilla";
import { ETIQUETA_CAPACIDAD } from "@/lib/catalogo";
import { ETIQUETA_CATEGORIA, ETIQUETA_TIPO_VARIABLE, type PlantillaVista, type VersionPlantilla } from "@/lib/presets";
import { activarPlantillaAccion, type ResultadoPlantillas } from "./acciones";
import { DialogoCaducarTrend } from "./dialogo-caducar-trend";
import { DialogoDemoPlantilla } from "./dialogo-demo-plantilla";
import { DialogoDuplicarTrend } from "./dialogo-duplicar-trend";
import { DialogoPlantilla } from "./dialogo-plantilla";

/** Una plantilla de la instalación con su versión vigente, sus variables y, si se despliega, su historial. */
export function TarjetaPlantilla({
  plantilla,
  abierto,
  historial,
  onHistorial,
  onResultado,
}: {
  plantilla: PlantillaVista;
  abierto: boolean;
  historial: VersionPlantilla[];
  onHistorial: () => void;
  onResultado: (resultado: ResultadoPlantillas) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2">
            <strong className="text-lg font-bold text-texto">{plantilla.nombre}</strong>
            <span className="font-mono text-sm text-texto-suave">{plantilla.clave}</span>
            <span className="rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-texto">
              Versión {plantilla.version}
            </span>
            {plantilla.kind === "trend" && (
              <span className="rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-texto">
                Trend · {plantilla.trendStatus}
              </span>
            )}
            {!plantilla.activa && (
              // alerta-permitida: insignia de estado de la plantilla
              <span className="rounded-full bg-elevada px-3 py-1 text-sm font-semibold text-error">Desactivada</span>
            )}
          </p>
          <p className="text-texto-suave">{plantilla.descripcion}</p>
          <p className="text-sm text-texto-suave">
            {ETIQUETA_CAPACIDAD[plantilla.capacidad]}
            {plantilla.restricciones.minimoReferencias > 0
              ? ` · exige ${plantilla.restricciones.minimoReferencias} foto(s) de referencia`
              : ""}
            {plantilla.restricciones.modelos.length > 0 ? ` · solo ${plantilla.restricciones.modelos.join(", ")}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DialogoPlantilla
            key={`${plantilla.id}:${plantilla.actualizado}`}
            plantilla={plantilla}
            onResultado={onResultado}
          />
          <DialogoDemoPlantilla
            key={`demo:${plantilla.id}:${plantilla.demo?.url ?? ""}`}
            plantilla={plantilla}
            onResultado={onResultado}
          />
          {plantilla.kind === "trend" && <DialogoDuplicarTrend plantilla={plantilla} onResultado={onResultado} />}
          {plantilla.kind === "trend" && plantilla.trendStatus !== "caducada" && (
            <DialogoCaducarTrend plantilla={plantilla} onResultado={onResultado} />
          )}
          <Boton
            variante={plantilla.activa ? "secundario" : "primario"}
            tamano="sm"
            disabled={plantilla.trendStatus === "caducada"}
            onClick={async () => onResultado(await activarPlantillaAccion(plantilla.id, !plantilla.activa))}
          >
            {plantilla.activa ? "Desactivar" : "Activar"}
          </Boton>
        </div>
      </div>

      {plantilla.demo ? (
        <DemoDePlantilla demo={plantilla.demo} titulo="Ejemplo que ven los usuarios" alturaMaxima="10rem" />
      ) : (
        <p className="text-sm text-texto-suave">Sin ejemplo: los usuarios no ven cómo queda antes de generar.</p>
      )}

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
              · {variable.categoria ? ETIQUETA_CATEGORIA[variable.categoria] : ETIQUETA_TIPO_VARIABLE[variable.tipo]}
              {variable.obligatoria ? " · obligatoria" : ""}
            </span>
          </li>
        ))}
      </ul>

      <Boton variante="fucsia" tamano="sm" className="self-start" onClick={() => onHistorial()}>
        {abierto ? "Ocultar versiones" : "Ver versiones"}
      </Boton>

      {abierto && (
        <ol className="flex flex-col gap-2">
          {historial.map((version) => (
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
    </div>
  );
}
