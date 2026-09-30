"use client";

import { Paso } from "@/components/ui/paso";
import { PanelContextoPersonaje } from "@/components/ui/personajes/panel-contexto";
import { AvisoRequisitos } from "@/components/ui/requisitos";
import type { Estimacion, TrabajoVista } from "@/lib/generacion";
import type { ContextoAplicado, PersonajeElegible } from "@/lib/personajes";
import type { Requisito } from "@/lib/requisitos";
import { ENVIO_FOTOGRAMA } from "@/lib/requisitos-crear";
import { BloqueConfirmacion } from "./bloque-confirmacion";
import type { ConfirmacionCoste } from "./panel-generar";
import { PasoInsertarCaptura } from "./paso-insertar-captura";
import { ResultadoTrabajo } from "./resultado-trabajo";
import { SeguimientoTrabajo } from "./seguimiento-trabajo";
import type { EstadoConfirmacion } from "./use-confirmacion-coste";
import type { Controles } from "./use-controles";

/**
 * **Revisa el coste y confirma** el fotograma. Es zona de claridad: el contexto de la ficha y las fotos que se
 * enviarán, los controles previos y la confirmación del coste, tal cual estaban antes de separar «Crear» en pasos.
 */
export function PasoCosteFotograma({
  numero,
  personaje,
  contexto,
  pidiendoContexto,
  controles,
  estimacion,
  conProducto,
  firma,
  bloqueos,
  requisitos,
  confirmacion,
  marcar,
  enviando,
  onIrARequisito,
  onGenerar,
}: {
  numero: number;
  personaje: PersonajeElegible | null;
  contexto: ContextoAplicado | null;
  pidiendoContexto: boolean;
  controles: Controles;
  estimacion: Estimacion;
  conProducto: boolean;
  firma: string;
  /** Lo propio del fotograma que falta (a quién, escena y plantilla). */
  bloqueos: readonly Requisito[];
  /** Todo lo que falta para generar, con los controles y las casillas de la confirmación: el aviso de arriba. */
  requisitos: readonly Requisito[];
  confirmacion: EstadoConfirmacion;
  /** Ya se puede marcar en rojo lo pendiente de este paso. */
  marcar: boolean;
  enviando: boolean;
  /** Lleva al paso y al campo al que apunta un requisito. */
  onIrARequisito: (requisito: Requisito) => void;
  onGenerar: (confirmacion: ConfirmacionCoste) => void;
}) {
  return (
    <Paso numero={numero} titulo="Revisa el coste y confirma">
      <AvisoRequisitos requisitos={requisitos} onIr={onIrARequisito} />
      {personaje && contexto && contexto.personajeId === personaje.id && (
        <PanelContextoPersonaje contexto={contexto} cargando={pidiendoContexto} />
      )}
      <BloqueConfirmacion
        controles={controles}
        estimacion={estimacion}
        conProducto={conProducto}
        etiqueta="Generar fotograma"
        firma={firma}
        bloqueos={[...bloqueos]}
        envio={ENVIO_FOTOGRAMA}
        paso="coste"
        confirmacion={confirmacion}
        marcar={marcar}
        avisoEnBloque
        onIntento={onIrARequisito}
        enviando={enviando}
        onGenerar={onGenerar}
      />
    </Paso>
  );
}

/**
 * **Resultado del fotograma**: su seguimiento mientras se genera y la imagen al terminar. Con un producto digital,
 * además, el paso de meter la captura en la pantalla, que se cobra y se confirma aparte.
 */
export function PasoResultadoFotograma({
  numero,
  fotograma,
  productoId,
  consultaInsercion,
  controles,
  estimacion,
  enviando,
  onCambio,
  onInsertarCaptura,
}: {
  numero: number;
  fotograma: TrabajoVista;
  /** Producto del clip; vacío si no lleva ninguno. */
  productoId: string;
  /** Lo que hace falta para evaluar la inserción como se enviará: la acción y el lugar elegidos. */
  consultaInsercion: { accion: string; lugarId: string };
  controles: Controles;
  estimacion: Estimacion;
  enviando: boolean;
  onCambio: (trabajo: TrabajoVista) => void;
  onInsertarCaptura: (confirmacion: ConfirmacionCoste) => void;
}) {
  return (
    <Paso numero={numero} titulo="Resultado del fotograma">
      <div className="flex flex-col gap-4">
        <SeguimientoTrabajo key={fotograma.id} inicial={fotograma} onCambio={onCambio} />
        {fotograma.medio && <ResultadoTrabajo trabajo={fotograma} />}
        {/*
          Producto digital: el fotograma que hay es el de la pantalla apagada, y el paso siguiente es meter la
          captura dentro. Se cobra aparte y se confirma aparte, y aquí se ve por qué.
        */}
        {fotograma.medio && productoId !== "" && (
          <PasoInsertarCaptura
            productoId={productoId}
            sujeto={{
              tipo: "fotograma",
              modelo: estimacion.modelo,
              medioId: fotograma.medio.id,
              productoId,
              accion: consultaInsercion.accion,
              ...(consultaInsercion.lugarId ? { lugarId: consultaInsercion.lugarId } : {}),
              paso: "insertar_captura",
            }}
            controles={controles}
            estimacion={estimacion}
            firma={`insercion|${fotograma.medio.id}|${productoId}|${estimacion.modelo}|${estimacion.sello}`}
            enviando={enviando}
            onGenerar={onInsertarCaptura}
          />
        )}
      </div>
    </Paso>
  );
}
