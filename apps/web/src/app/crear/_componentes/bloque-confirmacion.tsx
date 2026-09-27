"use client";

import { PanelAntesDeGenerar } from "@/components/ui/controles";
import type { Estimacion } from "@/lib/generacion";
import { type ConfirmacionCoste, PanelGenerar } from "./panel-generar";
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
  enviando,
  onGenerar,
}: {
  controles: Controles;
  estimacion: Estimacion;
  etiqueta: string;
  /** Qué se está confirmando, **incluida** la firma de los avisos confirmados. */
  firma: string;
  /** Bloqueos propios de la pantalla (falta imagen, falta descripción), además de los del motor. */
  bloqueos: string[];
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
        onConfirmar={controles.confirmar}
      />
      <PanelGenerar
        estimacion={estimacion}
        etiqueta={etiqueta}
        firma={`${firma}|${controles.firma}`}
        bloqueos={[...bloqueos, ...controles.bloqueos]}
        avisosConfirmados={controles.confirmados}
        enviando={enviando}
        onGenerar={onGenerar}
      />
    </>
  );
}
