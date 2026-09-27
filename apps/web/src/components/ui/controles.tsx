"use client";

import Link from "next/link";
import { Casilla } from "@/components/ui/choice";
import { cn } from "@/components/ui/cn";
import { AvisoEstado, ESTILO_PREPARACION } from "@/components/ui/feedback";
import {
  type ComprobacionVista,
  DESCRIPCION_ESTADO_CONTROL,
  type EstadoControl,
  ETIQUETA_ESTADO_CONTROL,
  type EvaluacionVista,
} from "@/lib/controles";

/**
 * Controles previos de generación (RF12, 0.18.0) en la interfaz. Zona de claridad: sin degradados, sin
 * animación y **nunca solo color**: cada estado lleva su icono y su texto, así que se distingue también en
 * escala de grises y con un lector de pantalla.
 */

/** Insignia compacta del estado: para la fila de una escena en el plan del proyecto. */
export function InsigniaControl({ estado, breve }: { estado: EstadoControl; breve?: boolean }) {
  const e = ESTILO_PREPARACION[estado];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border-2 px-2.5 py-1 text-sm font-semibold",
        e.borde,
        e.texto,
        e.circulo,
      )}
    >
      <span className="[&>svg]:size-4" aria-hidden>
        {e.icono}
      </span>
      <span>{breve ? ETIQUETA_ESTADO_CONTROL[estado] : e.titulo}</span>
    </span>
  );
}

/** Una comprobación: icono, motivo, acción y, si se arregla en otro sitio, el enlace que lleva allí. */
function FilaComprobacion({
  comprobacion,
  confirmada,
  deshabilitado,
  onConfirmar,
}: {
  comprobacion: ComprobacionVista;
  confirmada: boolean;
  deshabilitado: boolean;
  onConfirmar?: (regla: string, valor: boolean) => void;
}) {
  const e = ESTILO_PREPARACION[comprobacion.estado];
  return (
    <li className="flex gap-3 border-borde border-t-2 pt-3 first:border-t-0 first:pt-0">
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full [&>svg]:size-4",
          e.circulo,
          e.texto,
        )}
        aria-hidden
      >
        {e.icono}
      </span>
      <div className="flex flex-1 flex-col gap-1">
        <p className={cn("text-sm font-bold", e.texto)}>{ETIQUETA_ESTADO_CONTROL[comprobacion.estado]}</p>
        <p className="text-texto">{comprobacion.motivo}</p>
        <p className="text-texto-suave">{comprobacion.accion}</p>
        {comprobacion.enlace !== null && (
          <Link href={comprobacion.enlace} className="self-start font-semibold text-acento text-sm hover:underline">
            Ir a arreglarlo
          </Link>
        )}
        {comprobacion.confirmable && onConfirmar && (
          <Casilla
            etiqueta="Lo he leído y quiero generar igualmente"
            descripcion="Tu confirmación viaja con el envío y queda registrada en la evaluación."
            marcada={confirmada}
            deshabilitado={deshabilitado}
            onCambio={(valor) => onConfirmar(comprobacion.regla, valor)}
          />
        )}
      </div>
    </li>
  );
}

/**
 * Panel «Antes de generar»: el estado global y la lista de comprobaciones con su acción.
 *
 * Lo que decide es el servidor: esto pinta lo que dijo la última evaluación. Los avisos salvables se confirman
 * aquí, y esa confirmación entra en la firma de la confirmación de coste, así que confirmar un aviso distinto
 * estrena clave de idempotencia y no reutiliza la anterior.
 */
export function PanelAntesDeGenerar({
  evaluacion,
  confirmados,
  cargando,
  deshabilitado,
  onConfirmar,
}: {
  evaluacion: EvaluacionVista;
  /** Claves de regla que el usuario ya ha confirmado. */
  confirmados: readonly string[];
  /** Se está volviendo a evaluar en el servidor: lo que se muestra puede ser de hace un momento. */
  cargando?: boolean;
  deshabilitado?: boolean;
  onConfirmar?: (regla: string, valor: boolean) => void;
}) {
  return (
    <section aria-label="Antes de generar" className="flex flex-col gap-3">
      <AvisoEstado
        estado={evaluacion.estado}
        motivo={
          <>
            {DESCRIPCION_ESTADO_CONTROL[evaluacion.estado]}
            {cargando && <span className="text-texto-suave"> Comprobando otra vez…</span>}
          </>
        }
      />
      {evaluacion.comprobaciones.length > 0 && (
        <ul className="flex flex-col gap-3 rounded-tarjeta border-2 border-borde bg-superficie p-4">
          {evaluacion.comprobaciones.map((comprobacion) => (
            <FilaComprobacion
              key={comprobacion.regla}
              comprobacion={comprobacion}
              confirmada={confirmados.includes(comprobacion.regla)}
              deshabilitado={deshabilitado === true}
              onConfirmar={onConfirmar}
            />
          ))}
        </ul>
      )}
      <p className="text-sm text-texto-suave">
        Comprobado con las reglas <span className="font-mono">{evaluacion.reglasVersion}</span>. Estas comprobaciones
        son gratis: no se gasta nada hasta que confirmas el coste.
      </p>
    </section>
  );
}
