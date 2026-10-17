"use client";

import dynamic from "next/dynamic";
import { Boton } from "@/components/ui/button";
import { Aviso } from "@/components/ui/feedback";
import { Paso } from "@/components/ui/paso";
import { AvisoRequisitos } from "@/components/ui/requisitos";
import type { Estimacion, TrabajoVista } from "@/lib/generacion";
import type { ContextoAplicado, PersonajeElegible } from "@/lib/personajes";
import type { Requisito } from "@/lib/requisitos";
import { ENVIO_FOTOGRAMA } from "@/lib/requisitos-crear";
import { BloqueConfirmacion } from "./bloque-confirmacion";
import { PanelFotosQueAcompanan } from "./panel-fotos-que-acompanan";
import type { ConfirmacionCoste } from "./panel-generar";
import type { ReferenciaEnPantalla } from "./referencias-en-pantalla";

const PanelReferenciasTemporales = dynamic(
  () => import("./panel-referencias-temporales").then((m) => m.PanelReferenciasTemporales),
  { ssr: false },
);

import { PasoInsertarCaptura } from "./paso-insertar-captura";
import { ResultadoTrabajo } from "./resultado-trabajo";
import { SeguimientoTrabajo } from "./seguimiento-trabajo";
import type { EstadoConfirmacion } from "./use-confirmacion-coste";
import type { Controles } from "./use-controles";

const PanelContextoPersonaje = dynamic(
  () => import("@/components/ui/personajes/panel-contexto").then((m) => m.PanelContextoPersonaje),
  { ssr: false },
);

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
  conMarca,
  firma,
  bloqueos,
  requisitos,
  confirmacion,
  marcar,
  enviando,
  onIrARequisito,
  onGenerar,
  referenciasTemporales = [],
  onComprobarReferencias,
  comprobandoReferencias,
  resumenReferencias,
}: {
  numero: number;
  referenciasTemporales?: ReferenciaEnPantalla[];
  onComprobarReferencias?: () => void;
  comprobandoReferencias?: boolean;
  resumenReferencias?: string | null;
  personaje: PersonajeElegible | null;
  contexto: ContextoAplicado | null;
  pidiendoContexto: boolean;
  controles: Controles;
  estimacion: Estimacion;
  /** El producto elegido tiene marca declarada: se pide la casilla de la marca. */
  conMarca: boolean;
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
      <AvisoRequisitos requisitos={requisitos} marcar={marcar} onIr={onIrARequisito} />
      {personaje && contexto && contexto.personajeId === personaje.id && (
        <PanelContextoPersonaje contexto={contexto} cargando={pidiendoContexto} />
      )}
      <PanelFotosQueAcompanan evaluacion={controles.evaluacion} temporales={referenciasTemporales.length} />
      {referenciasTemporales.length > 0 && <PanelReferenciasTemporales referencias={referenciasTemporales} revision />}
      {referenciasTemporales.length > 0 && (
        <Boton variante="secundario" cargando={comprobandoReferencias} onClick={onComprobarReferencias}>
          Comprobar referencias
        </Boton>
      )}
      {resumenReferencias && <Aviso tono="info">{resumenReferencias}</Aviso>}
      <BloqueConfirmacion
        controles={controles}
        estimacion={estimacion}
        conMarca={conMarca}
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
