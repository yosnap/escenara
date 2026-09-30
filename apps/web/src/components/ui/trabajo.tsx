import { Ban, CheckCircle2, CircleHelp, Clock, Coins, ListOrdered, Loader2, OctagonX } from "lucide-react";
import type { ReactNode } from "react";
import {
  type EstadoCola,
  type EstadoTrabajo,
  ETIQUETA_ESTADO,
  esEstadoActivo,
  formatearTranscurrido,
  LARGO_ESTADO_PROVEEDOR,
  type TipoTrabajoCola,
} from "@/lib/generacion";
import { Alerta } from "./alerta";
import { cn } from "./cn";
import { MascotaChispa } from "./mascota";

/**
 * Estado de un trabajo de generación tal como lo informa el proveedor. **Nunca hay porcentajes ni fases
 * calculadas por tiempo**: se muestra el estado real traducido, el estado crudo del proveedor y el tiempo
 * transcurrido, que sí es un dato medido.
 */

const ASPECTO: Record<EstadoTrabajo, { icono: ReactNode; clase: string; circulo: string }> = {
  en_cola: { icono: <ListOrdered />, clase: "text-texto-suave", circulo: "bg-elevada" },
  esperando_limite: { icono: <Coins />, clase: "text-aviso", circulo: "bg-aviso/12" },
  cancelado: { icono: <Ban />, clase: "text-texto-suave", circulo: "bg-elevada" },
  preparando: { icono: <Loader2 className="animate-spin" />, clase: "text-texto-suave", circulo: "bg-elevada" },
  enviando: { icono: <Loader2 className="animate-spin" />, clase: "text-acento", circulo: "bg-acento/12" },
  enviado: { icono: <Clock />, clase: "text-acento", circulo: "bg-acento/12" },
  en_curso: { icono: <Loader2 className="animate-spin" />, clase: "text-acento", circulo: "bg-acento/12" },
  listo: { icono: <CheckCircle2 />, clase: "text-correcto", circulo: "bg-correcto/12" },
  fallido: { icono: <OctagonX />, clase: "text-error", circulo: "bg-error/12" },
  desconocido: { icono: <CircleHelp />, clase: "text-aviso", circulo: "bg-aviso/12" },
};

export function InsigniaEstado({ estado }: { estado: EstadoTrabajo }) {
  const a = ASPECTO[estado];
  return (
    <span
      className={cn("inline-flex items-center gap-2 rounded-full bg-elevada px-3 py-1 text-sm font-semibold", a.clase)}
    >
      <span aria-hidden className="[&>svg]:size-4">
        {a.icono}
      </span>
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}

const ETIQUETA_TIPO: Record<TipoTrabajoCola, string> = {
  fotograma: "Fotograma",
  animacion: "Clip de 4 s",
  // «Crear» no pide voces, pero la tarjeta de espera es la misma que usa la pantalla de voz de un proyecto.
  voz: "Voz de la escena",
};

/** Tarjeta de espera: estado real, estado crudo del proveedor, tiempo transcurrido y Chispa acompañando. */
export function EsperaTrabajo({
  tipo,
  estado,
  estadoProveedor,
  transcurridoSegundos,
  posicionEnCola,
  cola,
  children,
}: {
  tipo: TipoTrabajoCola;
  estado: EstadoTrabajo;
  estadoProveedor: string | null;
  transcurridoSegundos: number;
  /** Puesto real en la cola de esta instalación, si el trabajo sigue en ella. */
  posicionEnCola?: number | null;
  /** Estado de la cola: sirve para avisar de que no hay worker atendiendo, en vez de girar sin fin. */
  cola?: EstadoCola | null;
  children?: ReactNode;
}) {
  const a = ASPECTO[estado];
  const activo = esEstadoActivo(estado);
  // El estado del proveedor se muestra recortado: es una etiqueta suya, no un texto para leer.
  const etiquetaProveedor = estadoProveedor?.slice(0, LARGO_ESTADO_PROVEEDOR);
  return (
    <div role="status" className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-5">
      <div className="flex items-center gap-4">
        <MascotaChispa expresion={estado === "listo" ? "celebra" : "saluda"} tamano={64} />
        <div className="flex flex-col gap-1">
          <p className="text-sm text-texto-suave">{ETIQUETA_TIPO[tipo]}</p>
          <p className={cn("flex items-center gap-2 text-xl font-bold", a.clase)}>
            <span aria-hidden className="[&>svg]:size-5">
              {a.icono}
            </span>
            {ETIQUETA_ESTADO[estado]}
          </p>
          <p className="text-sm text-texto-suave">
            {formatearTranscurrido(transcurridoSegundos)}
            {etiquetaProveedor && (
              <>
                {" · el proveedor informa «"}
                <span className="font-mono">{etiquetaProveedor}</span>»
              </>
            )}
          </p>
        </div>
      </div>
      {estado === "en_cola" && posicionEnCola != null && (
        <p className="text-sm text-texto-suave">
          {posicionEnCola === 1 ? "Es el siguiente en salir." : `Hay ${posicionEnCola - 1} trabajos delante del tuyo.`}
        </p>
      )}
      {activo && cola && !cola.workerActivo && (
        // Ya va dentro de la región viva de la tarjeta: la alerta no se anuncia por su cuenta.
        <Alerta tipo="aviso" compacta anuncio="ninguno">
          Ahora mismo no hay ningún proceso atendiendo la cola, así que el trabajo espera. Avisa a quien administra esta
          instalación: nada se ha perdido y no se enviará dos veces.
        </Alerta>
      )}
      {activo && (
        <p className="text-sm text-texto-suave">
          Puedes cerrar esta página: el trabajo sigue en la cola del servidor y lo encuentras en tu historial.
        </p>
      )}
      {children}
    </div>
  );
}
