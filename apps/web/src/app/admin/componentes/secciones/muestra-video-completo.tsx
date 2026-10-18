"use client";

import { useState } from "react";
import { type EleccionVideoCompleto, SelectorVideoCompleto } from "@/components/ui/video-completo";
import type { CondicionesVideoCompleto } from "@/lib/video-completo";

/**
 * Muestra del selector del vídeo completo con datos inventados: un proyecto en modo de voz registrada, con
 * protagonista y las duraciones largas abiertas para que se vean las tres. Elegir no llama a nadie.
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
  return (
    <div className="w-full">
      <SelectorVideoCompleto
        condiciones={CONDICIONES}
        eleccion={eleccion}
        personajes={PERSONAJES}
        protagonistaId="lucia"
        precio={{ creditos: 2, euros: 0.01, comprobado: "2026-10-18" }}
        onCambio={setEleccion}
      />
    </div>
  );
}
