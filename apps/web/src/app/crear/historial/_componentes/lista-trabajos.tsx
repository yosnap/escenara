"use client";

import { RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton, claseBoton } from "@/components/ui/button";
import { Aviso, EstadoVacio } from "@/components/ui/feedback";
import { MiniaturaMedio } from "@/components/ui/media/miniatura-medio";
import { InsigniaEstado } from "@/components/ui/trabajo";
import { causaConocida, etiquetaDelFallo } from "@/lib/causa-fallo";
import { type EstadoCola, esCancelable, esEstadoActivo, formatearCreditos, type TrabajoVista } from "@/lib/generacion";
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
        <Aviso tono="aviso">
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
                {trabajo.proporcion && (
                  <span className="rounded-full bg-elevada px-3 py-1 text-sm text-texto-suave">
                    Formato {trabajo.proporcion}
                  </span>
                )}
                {trabajo.posicionEnCola !== null && (
                  <span className="rounded-full bg-elevada px-3 py-1 text-sm text-texto-suave">
                    Puesto {trabajo.posicionEnCola} de la cola
                  </span>
                )}
              </div>
              <p className="truncate text-texto" title={trabajo.escena}>
                {trabajo.escena === "" ? "Sin descripción" : trabajo.escena}
              </p>
              <p className="text-sm text-texto-suave">
                {new Date(trabajo.creadoEn).toLocaleString("es-ES")} ·{" "}
                {trabajo.creditosConsumidos === null
                  ? `${formatearCreditos(trabajo.creditosEstimados)} (estimación)`
                  : `${formatearCreditos(trabajo.creditosConsumidos)} según el proveedor`}
                {trabajo.intentos > 1 && ` · ${trabajo.intentos} de ${trabajo.intentosMaximos} intentos`}
              </p>
              {/* Con causa concreta, el mensaje ya la dice entera: la etiqueta solo la repetiría. */}
              {trabajo.motivoFallo && !(causaConocida(trabajo.causaFallo) && trabajo.error) && (
                <p className="text-sm text-texto-suave">{etiquetaDelFallo(trabajo.motivoFallo, trabajo.causaFallo)}.</p>
              )}
              {/* Es el historial: lo que ya estaba no se anuncia al abrirlo. */}
              {trabajo.error && (
                <Alerta tipo="error" compacta anuncio="ninguno">
                  {trabajo.error}
                </Alerta>
              )}
              {trabajo.excesoCreditos !== null && trabajo.excesoCreditos > 0 && (
                <Alerta tipo="aviso" compacta anuncio="ninguno" protege>
                  El proveedor cobró {formatearCreditos(trabajo.excesoCreditos)} por encima del límite que autorizaste.
                  Se ha registrado el gasto real y quien administra esta instalación también lo ve.
                </Alerta>
              )}
              {trabajo.enRevision && (
                <Alerta tipo="aviso" compacta anuncio="ninguno" protege>
                  Este trabajo está en revisión: su reserva de presupuesto sigue apartada hasta que se sepa si el
                  proveedor lo cobró. No se reenviará.
                </Alerta>
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
