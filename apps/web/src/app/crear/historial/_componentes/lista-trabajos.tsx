"use client";

import { RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Boton, claseBoton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { InsigniaEstado } from "@/components/ui/trabajo";
import {
  type EstadoCola,
  ETIQUETA_MOTIVO_FALLO,
  esCancelable,
  esEstadoActivo,
  formatearCreditos,
  type TrabajoVista,
} from "@/lib/generacion";
import { cancelarTrabajo, consultarTrabajo, reconsultarTrabajo } from "../../_componentes/api-generacion";
import { LimiteDeGasto } from "../../_componentes/limite-de-gasto";

/**
 * Historial de generaciones. Cada fila dice en qué punto está de verdad: puesto en la cola, motivo del fallo
 * si lo hay y si necesita revisión a mano. Los que aún no han salido hacia el proveedor se pueden cancelar,
 * y eso suelta la reserva de presupuesto. La generación **nunca** se reenvía: solo se consulta su tarea.
 */
export function ListaTrabajos({ iniciales, cola }: { iniciales: TrabajoVista[]; cola: EstadoCola }) {
  const [trabajos, setTrabajos] = useState(iniciales);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reemplazar = (actualizado: TrabajoVista) =>
    setTrabajos((lista) => lista.map((t) => (t.id === actualizado.id ? actualizado : t)));

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
    reemplazar(respuesta.datos);
  };

  const cancelar = async (trabajo: TrabajoVista) => {
    setOcupado(trabajo.id);
    setError(null);
    const respuesta = await cancelarTrabajo(trabajo.id);
    setOcupado(null);
    if (!respuesta.ok) {
      setError(respuesta.error);
      return;
    }
    reemplazar(respuesta.datos);
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
      {!cola.workerActivo && (cola.enCola > 0 || cola.enMarcha > 0) && (
        <Aviso tono="info">
          Tienes trabajos esperando y ahora mismo no hay ningún proceso atendiendo la cola. Nada se ha perdido y nada se
          enviará dos veces: avisa a quien administra esta instalación.
        </Aviso>
      )}
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
                {trabajo.posicionEnCola !== null && (
                  <span className="rounded-full bg-elevada px-3 py-1 text-sm text-texto-suave">
                    Puesto {trabajo.posicionEnCola} de la cola
                  </span>
                )}
              </div>
              <p className="truncate text-texto" title={trabajo.prompt}>
                {trabajo.prompt}
              </p>
              <p className="text-sm text-texto-suave">
                {new Date(trabajo.creadoEn).toLocaleString("es-ES")} ·{" "}
                {trabajo.creditosConsumidos === null
                  ? `${formatearCreditos(trabajo.creditosEstimados)} (estimación)`
                  : `${formatearCreditos(trabajo.creditosConsumidos)} según el proveedor`}
                {trabajo.intentos > 1 && ` · ${trabajo.intentos} de ${trabajo.intentosMaximos} intentos`}
              </p>
              {trabajo.motivoFallo && (
                <p className="text-sm text-texto-suave">{ETIQUETA_MOTIVO_FALLO[trabajo.motivoFallo]}.</p>
              )}
              {trabajo.error && <p className="text-sm font-medium text-texto">{trabajo.error}</p>}
              {trabajo.excesoCreditos !== null && trabajo.excesoCreditos > 0 && (
                <p className="text-sm font-medium text-texto">
                  El proveedor cobró {formatearCreditos(trabajo.excesoCreditos)} por encima del límite que autorizaste.
                  Se ha registrado el gasto real y quien administra esta instalación también lo ve.
                </p>
              )}
              {trabajo.enRevision && (
                <p className="text-sm font-medium text-texto">
                  Este trabajo está en revisión: su reserva de presupuesto sigue apartada hasta que se sepa si el
                  proveedor lo cobró. No se reenviará.
                </p>
              )}
              {trabajo.estado === "esperando_limite" && <LimiteDeGasto trabajo={trabajo} onAutorizado={reemplazar} />}
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
              {esCancelable(trabajo.estado) && (
                <Boton
                  variante="fantasma"
                  tamano="sm"
                  icono={<X className="size-4" />}
                  cargando={ocupado === trabajo.id}
                  onClick={() => cancelar(trabajo)}
                >
                  Cancelar
                </Boton>
              )}
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
