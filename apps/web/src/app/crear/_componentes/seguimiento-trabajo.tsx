"use client";

import { RefreshCw } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { EsperaTrabajo } from "@/components/ui/trabajo";
import type { TrabajoVista } from "@/lib/generacion";
import { type AlmacenTrabajo, crearAlmacenTrabajo } from "./almacen-trabajo";

/**
 * Espera de un trabajo: sondea su estado mientras está en pantalla y avisa al padre de cada cambio. Un
 * trabajo «sin respuesta» muestra su identificador de tarea y el botón para volver a consultarlo, con el
 * aviso de que no se reenviará (reenviar podría cobrarse dos veces).
 */
export function SeguimientoTrabajo({
  inicial,
  onCambio,
}: {
  inicial: TrabajoVista;
  onCambio: (trabajo: TrabajoVista) => void;
}) {
  // El almacén se crea una sola vez por trabajo: `key={trabajo.id}` en quien lo usa garantiza que un
  // trabajo nuevo empieza con el suyo.
  const [almacen] = useState<AlmacenTrabajo>(() => crearAlmacenTrabajo(inicial, onCambio));
  const estado = useSyncExternalStore(almacen.subscribe, almacen.obtener, almacen.obtener);
  const { trabajo } = estado;
  const sinRespuesta = trabajo.estado === "desconocido";
  const listoSinGuardar = trabajo.estado === "listo" && trabajo.medio === null;

  return (
    <div className="flex flex-col gap-3">
      <EsperaTrabajo
        tipo={trabajo.tipo}
        estado={trabajo.estado}
        estadoProveedor={trabajo.estadoProveedor}
        transcurridoSegundos={estado.transcurridoSegundos}
      >
        {trabajo.error && <p className="text-sm font-medium text-texto">{trabajo.error}</p>}
        {(sinRespuesta || listoSinGuardar) && (
          <div className="flex flex-col gap-2">
            {trabajo.taskId && (
              <p className="text-sm text-texto-suave">
                Identificador de la tarea en KIE: <span className="font-mono">{trabajo.taskId}</span>
              </p>
            )}
            <Boton
              variante="secundario"
              tamano="sm"
              className="self-start"
              icono={<RefreshCw className="size-4" />}
              cargando={estado.consultando}
              onClick={almacen.reconsultar}
            >
              Volver a consultar
            </Boton>
          </div>
        )}
      </EsperaTrabajo>
      {estado.error && <Aviso tono="error">{estado.error}</Aviso>}
    </div>
  );
}
