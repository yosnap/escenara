"use client";

import { RefreshCw, X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Alerta } from "@/components/ui/alerta";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { EsperaTrabajo } from "@/components/ui/trabajo";
import { esCancelable, formatearCreditos, type TrabajoVista } from "@/lib/generacion";
import { type AlmacenTrabajo, crearAlmacenTrabajo } from "./almacen-trabajo";
import { LimiteDeGasto } from "./limite-de-gasto";

/**
 * Espera de un trabajo: sondea su estado mientras está en pantalla y avisa al padre de cada cambio.
 *
 * - en cola se ve el puesto real y si hay algún proceso atendiéndola (nada de girar sin fin);
 * - mientras no ha salido hacia el proveedor se puede cancelar, y eso suelta la reserva;
 * - un trabajo «sin respuesta» muestra su identificador de tarea y el botón para volver a consultarlo, con el
 *   aviso de que no se reenviará (reenviar podría cobrarse dos veces).
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
        posicionEnCola={trabajo.posicionEnCola}
        cola={estado.cola}
      >
        {/* La tarjeta ya es una región viva: la alerta no se anuncia por su cuenta. */}
        {trabajo.error && (
          <Alerta tipo="error" compacta anuncio="ninguno">
            {trabajo.error}
          </Alerta>
        )}
        {trabajo.excesoCreditos !== null && trabajo.excesoCreditos > 0 && (
          <Alerta tipo="aviso" compacta anuncio="ninguno" protege>
            El proveedor ha cobrado {formatearCreditos(trabajo.excesoCreditos)} por encima del límite que autorizaste.
            No se puede deshacer: el precio final lo decide él. Se ha registrado el gasto real y quien administra esta
            instalación también lo ve.
          </Alerta>
        )}
        {trabajo.estado === "esperando_limite" && (
          // `almacen.aplicar` y no `onCambio`: así la tarjeta adopta el trabajo nuevo y vuelve a sondearlo.
          <LimiteDeGasto trabajo={trabajo} onAutorizado={almacen.aplicar} />
        )}
        {esCancelable(trabajo.estado) && (
          <Boton
            variante="secundario"
            tamano="sm"
            className="self-start"
            icono={<X className="size-4" />}
            cargando={estado.consultando}
            onClick={almacen.cancelar}
          >
            Cancelar el trabajo
          </Boton>
        )}
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
