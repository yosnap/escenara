"use client";

import { Paso } from "@/components/ui/paso";
import { PanelContextoPersonaje } from "@/components/ui/personajes/panel-contexto";
import type { Estimacion, TrabajoVista } from "@/lib/generacion";
import type { ContextoAplicado, PersonajeElegible } from "@/lib/personajes";
import { BloqueConfirmacion } from "./bloque-confirmacion";
import type { ConfirmacionCoste } from "./panel-generar";
import { PasoInsertarCaptura } from "./paso-insertar-captura";
import { ResultadoTrabajo } from "./resultado-trabajo";
import { SeguimientoTrabajo } from "./seguimiento-trabajo";
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
  enviando,
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
  bloqueos: string[];
  enviando: boolean;
  onGenerar: (confirmacion: ConfirmacionCoste) => void;
}) {
  return (
    <Paso numero={numero} titulo="Revisa el coste y confirma">
      {personaje && contexto && contexto.personajeId === personaje.id && (
        <PanelContextoPersonaje contexto={contexto} cargando={pidiendoContexto} />
      )}
      <BloqueConfirmacion
        controles={controles}
        estimacion={estimacion}
        conProducto={conProducto}
        etiqueta="Generar fotograma"
        firma={firma}
        bloqueos={bloqueos}
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
