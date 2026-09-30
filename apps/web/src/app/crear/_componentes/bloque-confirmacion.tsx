"use client";

import { PanelAntesDeGenerar } from "@/components/ui/controles";
import type { Estimacion } from "@/lib/generacion";
import { idRequisito, type Requisito, requisitosDeControles } from "@/lib/requisitos";
import { type ConfirmacionCoste, PanelGenerar } from "./panel-generar";
import type { EstadoConfirmacion } from "./use-confirmacion-coste";
import type { Controles } from "./use-controles";

/**
 * Lo que se ve justo antes de gastar: el panel «Antes de generar» con el estado de los controles previos
 * (0.18.0) y, debajo, la confirmación del coste.
 *
 * Van juntos porque son un solo paso: el estado dice si se puede, y la confirmación dice cuánto cuesta. El
 * fotograma y el clip usan cada uno el suyo, porque cada gasto se confirma por separado.
 */
export function BloqueConfirmacion({
  controles,
  estimacion,
  etiqueta,
  firma,
  bloqueos,
  envio,
  paso,
  confirmacion,
  marcar,
  avisoEnBloque,
  conProducto = false,
  enviando,
  onIntento,
  onGenerar,
}: {
  controles: Controles;
  estimacion: Estimacion;
  etiqueta: string;
  /** Qué se está confirmando, **incluida** la firma de los avisos confirmados. */
  firma: string;
  /** Bloqueos propios de la pantalla (falta imagen, falta descripción), además de los del motor. */
  bloqueos: Requisito[];
  /** Envío que se confirma («fotograma», «clip»…) y paso donde está: los campos de la confirmación se marcan con ellos. */
  envio: string;
  paso: string;
  /** Casillas de la confirmación, si las guarda quien pinta el paso. */
  confirmacion?: EstadoConfirmacion;
  /** Ya se puede marcar en rojo lo pendiente de las casillas (ver `PanelGenerar`). */
  marcar?: boolean;
  /** El paso enseña arriba el bloque de requisitos: la lista de aquí no se repite al lector de pantalla. */
  avisoEnBloque?: boolean;
  /** Se pulsó el botón mientras faltaba algo. */
  onIntento?: (primero: Requisito) => void;
  /** `true` cuando el envío lleva producto: entonces se pide además la casilla del derecho de marca. */
  conProducto?: boolean;
  enviando: boolean;
  onGenerar: (confirmacion: ConfirmacionCoste) => void;
}) {
  return (
    <>
      <PanelAntesDeGenerar
        evaluacion={controles.evaluacion}
        confirmados={controles.confirmados}
        cargando={controles.cargando}
        deshabilitado={enviando}
        requisito={idRequisito(envio, "controles")}
        onConfirmar={controles.confirmar}
      />
      <PanelGenerar
        estimacion={estimacion}
        etiqueta={etiqueta}
        firma={`${firma}|${controles.firma}`}
        bloqueos={[...bloqueos, ...requisitosDeControles(controles.bloqueos, envio, paso)]}
        avisosConfirmados={controles.confirmados}
        conProducto={conProducto}
        envio={envio}
        paso={paso}
        confirmacion={confirmacion}
        marcar={marcar}
        avisoEnBloque={avisoEnBloque}
        onIntento={onIntento}
        enviando={enviando}
        onGenerar={onGenerar}
      />
    </>
  );
}
