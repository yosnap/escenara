"use client";

import { useState } from "react";
import { Casilla } from "@/components/ui/choice";
import { AreaTexto, Campo } from "@/components/ui/field";
import { BarraDePasos } from "@/components/ui/multipaso";
import { AvisoRequisitos, enfocarRequisito, MarcaRequisito } from "@/components/ui/requisitos";
import type { PasoDelFlujo } from "@/lib/multipaso";
import type { Requisito } from "@/lib/requisitos";
import { Muestra, Seccion } from "../seccion";

const PASOS: PasoDelFlujo[] = [
  { id: "escena", titulo: "Describe la escena", corto: "Escena", estado: "en-curso", pendientes: 2 },
  { id: "coste", titulo: "Revisa el coste y confirma", corto: "Coste", estado: "pendiente", pendientes: 1 },
  { id: "clip", titulo: "El clip", corto: "Clip", estado: "pendiente" },
];

/**
 * Aviso de requisitos pendientes: la lista de arriba con cada punto como botón que lleva al campo, y el campo y la
 * casilla marcados con aro de error completo y su mensaje. Sin animación propia: el resaltado al llegar respeta
 * `prefers-reduced-motion`.
 */
export function SeccionRequisitos() {
  const [texto, setTexto] = useState("");
  const [derechos, setDerechos] = useState(false);
  const faltaTexto = texto.trim().length < 10 ? "Falta describir la escena (mínimo 10 caracteres)." : undefined;
  const faltaDerechos = derechos ? undefined : "Falta confirmar que tienes derecho a usar la imagen.";
  const requisitos: Requisito[] = [
    ...(faltaTexto ? [{ id: "demo-descripcion", paso: "escena", texto: faltaTexto }] : []),
    ...(faltaDerechos ? [{ id: "demo-derechos", paso: "coste", texto: faltaDerechos }] : []),
  ];
  return (
    <Seccion
      id="requisitos"
      titulo="Requisitos pendientes"
      descripcion="Lo que falta antes de generar, arriba del paso y con cada punto como botón que lleva al campo, lo enfoca y lo resalta. El campo o la casilla pendiente lleva aro de error completo, aria-invalid y el mensaje debajo; la barra de pasos cuenta lo que falta en cada paso."
    >
      <Muestra titulo="Aviso, campo y casilla (pulsa un punto del aviso)">
        <div className="flex w-full flex-col gap-4">
          <AvisoRequisitos requisitos={requisitos} onIr={(r) => enfocarRequisito(r.id)} />
          <Campo etiqueta="Qué quieres ver" requisito="demo-descripcion" error={faltaTexto}>
            {(props) => <AreaTexto {...props} value={texto} onChange={(e) => setTexto(e.target.value)} />}
          </Campo>
          <Casilla
            etiqueta="Tengo derecho a usar esta imagen"
            marcada={derechos}
            onCambio={setDerechos}
            requisito="demo-derechos"
            error={faltaDerechos}
          />
        </div>
      </Muestra>
      <div className="h-6" />
      <Muestra titulo="Un control sin marca propia (selector, lista de fotos)">
        <div className="w-full max-w-md">
          <MarcaRequisito id="demo-selector" error="El modelo elegido no acepta fotos de referencia: elige otro.">
            <p className="rounded-control bg-elevada p-3 text-texto">Aquí iría el selector de modelo.</p>
          </MarcaRequisito>
        </div>
      </Muestra>
      <div className="h-6" />
      <Muestra titulo="Barra de pasos con requisitos pendientes">
        <div className="w-full">
          <BarraDePasos
            etiqueta="Pasos de ejemplo con requisitos"
            pasos={PASOS}
            actual="escena"
            visitados={["escena", "coste"]}
            onIr={() => {}}
            onNoDisponible={() => {}}
          />
        </div>
      </Muestra>
    </Seccion>
  );
}
