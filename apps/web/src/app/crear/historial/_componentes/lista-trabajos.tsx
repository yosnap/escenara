"use client";

import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Boton, claseBoton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { InsigniaEstado } from "@/components/ui/trabajo";
import { esEstadoActivo, formatearCreditos, type TrabajoVista } from "@/lib/generacion";
import { consultarTrabajo, reconsultarTrabajo } from "../../_componentes/api-generacion";

/**
 * Historial de generaciones. Cada fila se puede volver a consultar a mano: al volver aquí, un trabajo que
 * se quedó a medias (porque se cerró el navegador) se reconcilia con el identificador de tarea guardado.
 * Nunca se reenvía la generación.
 */
export function ListaTrabajos({ iniciales }: { iniciales: TrabajoVista[] }) {
  const [trabajos, setTrabajos] = useState(iniciales);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const consultar = async (trabajo: TrabajoVista) => {
    setOcupado(trabajo.id);
    setError(null);
    // Un trabajo en marcha se consulta con el ritmo normal; uno parado, forzando la reconciliación.
    const respuesta = esEstadoActivo(trabajo.estado)
      ? await consultarTrabajo(trabajo.id)
      : await reconsultarTrabajo(trabajo.id);
    setOcupado(null);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    const actualizado = respuesta.datos;
    setTrabajos((lista) => lista.map((t) => (t.id === actualizado.id ? actualizado : t)));
  };

  if (trabajos.length === 0) {
    return (
      <EstadoVacio
        titulo="Todavía no has generado nada"
        texto="Cuando generes un fotograma o un clip, aparecerán aquí con su estado y su coste."
        accion={
          <Link href="/crear" className={claseBoton("chispa", "md")}>
            Ir a Crear
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <Aviso tono="error">{error}</Aviso>}
      <ul className="flex flex-col gap-3">
        {trabajos.map((trabajo) => (
          <li
            key={trabajo.id}
            className="flex flex-col gap-3 rounded-tarjeta border border-borde bg-superficie p-4 sm:flex-row"
          >
            <div className="size-20 shrink-0 overflow-hidden rounded-control border border-borde bg-elevada">
              {trabajo.medio ? (
                // Sin recortar: un vertical se ve entero dentro del cuadro.
                <MiniaturaMedio medio={trabajo.medio} className="object-contain" />
              ) : (
                <span className="flex size-full items-center justify-center text-sm text-texto-suave">Sin archivo</span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <InsigniaEstado estado={trabajo.estado} />
                <span className="font-mono text-sm text-texto-suave">{trabajo.modelo}</span>
              </div>
              <p className="truncate text-texto" title={trabajo.prompt}>
                {trabajo.prompt}
              </p>
              <p className="text-sm text-texto-suave">
                {new Date(trabajo.creadoEn).toLocaleString("es-ES")} ·{" "}
                {trabajo.creditosConsumidos === null
                  ? `${formatearCreditos(trabajo.creditosEstimados)} (estimación)`
                  : `${formatearCreditos(trabajo.creditosConsumidos)} según el proveedor`}
              </p>
              {trabajo.error && <p className="text-sm font-medium text-texto">{trabajo.error}</p>}
              {trabajo.taskId && trabajo.estado === "desconocido" && (
                <p className="text-sm text-texto-suave">
                  Tarea en KIE: <span className="font-mono">{trabajo.taskId}</span>. No se reenviará.
                </p>
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <Boton
                variante="secundario"
                tamano="sm"
                icono={<RefreshCw className="size-4" />}
                cargando={ocupado === trabajo.id}
                onClick={() => consultar(trabajo)}
              >
                Volver a consultar
              </Boton>
              {trabajo.medio && (
                <Link href="/biblioteca" className={claseBoton("fantasma", "sm")}>
                  Ver en la biblioteca
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
