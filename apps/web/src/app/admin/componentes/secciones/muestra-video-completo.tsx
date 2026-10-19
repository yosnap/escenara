"use client";

import { useState } from "react";
import { Boton } from "@/components/ui/button";
import { type EleccionVideoCompleto, SelectorVideoCompleto } from "@/components/ui/video-completo";
import type { CondicionesVideoCompleto } from "@/lib/video-completo";

/**
 * Muestra del selector del vídeo completo con datos inventados: un proyecto en modo de voz registrada, con
 * protagonista y las duraciones largas abiertas para que se vean las tres. Elegir no llama a nadie. El precio se
 * puede alternar entre una llamada de pago y una entrada que se paga por la cuota del plan con reserva de pago.
 */
const CONDICIONES: CondicionesVideoCompleto = {
  modoVoz: "omni",
  tieneProtagonista: true,
  largasActivas: true,
  podcastActivo: true,
  dualcastActivo: true,
  escenasMaximas: 30,
  segundosMaximos: 300,
};

const PERSONAJES = [
  { id: "lucia", nombre: "Lucía" },
  { id: "mario", nombre: "Mario" },
];

export function MuestraVideoCompleto() {
  const [eleccion, setEleccion] = useState<EleccionVideoCompleto>({
    duracion: 20,
    tipo: "entrevista",
    segundoPersonajeId: "mario",
  });
  const [porCuota, setPorCuota] = useState(false);
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        <Boton tamano="sm" variante={porCuota ? "secundario" : "primario"} onClick={() => setPorCuota(false)}>
          Por créditos
        </Boton>
        <Boton tamano="sm" variante={porCuota ? "primario" : "secundario"} onClick={() => setPorCuota(true)}>
          Por cuota del plan
        </Boton>
      </div>
      <SelectorVideoCompleto
        condiciones={CONDICIONES}
        eleccion={eleccion}
        personajes={PERSONAJES}
        protagonistaId="lucia"
        precio={
          porCuota
            ? {
                creditos: 0,
                euros: 0,
                comprobado: "",
                porCuota: true,
                nombreProveedor: "NaN builders",
                reserva: { creditos: 2, euros: 0.01, comprobado: "2026-10-18" },
              }
            : { creditos: 2, euros: 0.01, comprobado: "2026-10-18" }
        }
        onCambio={setEleccion}
      />
    </div>
  );
}
