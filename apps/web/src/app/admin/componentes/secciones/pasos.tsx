"use client";

import { Multipaso, PanelDePaso, useMultipaso } from "@/components/ui/multipaso";
import { Paso } from "@/components/ui/paso";
import type { PasoDelFlujo } from "@/lib/multipaso";
import { Muestra, Seccion } from "../seccion";

/** Los cuatro estados a la vez: hecho, en curso, pendiente y bloqueado con su motivo. */
const PASOS: PasoDelFlujo[] = [
  { id: "origen", titulo: "¿De dónde sale el clip?", corto: "Origen", estado: "hecho" },
  { id: "escena", titulo: "Describe la escena", corto: "Escena", estado: "en-curso" },
  { id: "voz", titulo: "Elige la voz", corto: "Voz", estado: "pendiente" },
  {
    id: "coste",
    titulo: "Revisa el coste y confirma",
    corto: "Coste",
    estado: "bloqueado",
    motivo: "Describe antes la escena (mínimo 10 caracteres): el coste depende de lo que se pide.",
  },
];

export function SeccionPasos() {
  // La muestra no escribe `?paso=` en la dirección: el catálogo no es una pantalla de trabajo.
  const control = useMultipaso(PASOS, "escena", false);
  return (
    <Seccion
      id="pasos"
      titulo="Flujo por pasos"
      descripcion="Barra de pasos con navegación libre (Crear y Proyectos): se salta a lo hecho o visitado, lo bloqueado dice por qué, solo se ve el paso actual y los demás siguen montados. Sin animaciones: va junto a zonas de claridad."
    >
      <Muestra titulo="Hecho, en curso, pendiente y bloqueado">
        <div className="w-full">
          <Multipaso etiqueta="Pasos de ejemplo" pasos={PASOS} control={control}>
            {PASOS.map((p, i) => (
              <PanelDePaso key={p.id} id={p.id}>
                <Paso numero={i + 1} titulo={p.titulo}>
                  <p className="text-texto-suave">
                    Contenido del paso «{p.corto}». Pulsa el paso bloqueado o «Siguiente» para ver su motivo.
                  </p>
                </Paso>
              </PanelDePaso>
            ))}
          </Multipaso>
        </div>
      </Muestra>
    </Seccion>
  );
}
