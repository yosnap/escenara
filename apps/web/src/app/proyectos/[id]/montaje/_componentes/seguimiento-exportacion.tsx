"use client";

import { useState, useSyncExternalStore } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso, ProgresoEtapas } from "@/components/ui/feedback";
import type { ExportacionVista } from "@/lib/montaje";
import { ETIQUETA_ETAPA_EXPORTACION } from "@/lib/montaje";
import { etapasEnPantalla } from "@/lib/montaje-pantalla";
import { type AlmacenExportacion, crearAlmacenExportacion, exportacionTerminada } from "./almacen-exportacion";
import { TarjetaExportacion } from "./tarjeta-exportacion";

/**
 * La exportación que está en marcha: sus **etapas reales** y, al terminar, el MP4 con su descarga.
 *
 * El progreso sale del `-progress` de FFmpeg a través del servidor, nunca de un reloj de esta pantalla: si el
 * render se atasca, la barra se queda quieta, que es la verdad.
 */
export function SeguimientoExportacion({
  inicial,
  versionVigente,
  onCambio,
}: {
  inicial: ExportacionVista;
  /** Versión del montaje de ahora, para decir si lo que sale sigue siendo lo que se ve en la pantalla. */
  versionVigente: number;
  onCambio?: (exportacion: ExportacionVista) => void;
}) {
  // Un almacén por exportación: `key={exportacion.id}` en quien lo usa garantiza que otra empieza con el suyo.
  const [almacen] = useState<AlmacenExportacion>(() => crearAlmacenExportacion(inicial, onCambio));
  const { exportacion, consultando, error } = useSyncExternalStore(almacen.subscribe, almacen.obtener, almacen.obtener);
  const terminada = exportacionTerminada(exportacion.estado);

  if (terminada) {
    return (
      <div className="flex flex-col gap-3">
        <TarjetaExportacion
          exportacion={exportacion}
          versionVigente={versionVigente}
          renovando={consultando}
          onRenovar={almacen.reconsultar}
        />
        {error && <Aviso tono="error">{error}</Aviso>}
      </div>
    );
  }

  return (
    <section
      aria-busy
      aria-label="Montaje en marcha"
      className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4"
    >
      <ProgresoEtapas etapas={etapasEnPantalla(exportacion.etapa, exportacion.estado)} etiqueta="Etapas del montaje" />
      <p aria-live="polite" className="text-texto">
        {ETIQUETA_ETAPA_EXPORTACION[exportacion.etapa]}
        {exportacion.progreso > 0 && <span className="font-mono text-texto-suave"> · {exportacion.progreso} %</span>}
      </p>
      <p className="text-sm text-texto-suave">
        Lo monta esta misma máquina con FFmpeg, así que no gasta créditos y puedes cerrar la pestaña: al volver, el
        estado sigue aquí. El porcentaje es el que informa FFmpeg de la etapa en curso, no una cuenta atrás.
      </p>
      <Boton
        variante="secundario"
        tamano="sm"
        className="self-start"
        cargando={consultando}
        onClick={almacen.reconsultar}
      >
        Comprobar ahora
      </Boton>
      {error && <Aviso tono="error">{error}</Aviso>}
    </section>
  );
}
