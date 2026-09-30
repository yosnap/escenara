"use client";

import { PartyPopper } from "lucide-react";
import { Boton } from "@/components/ui/button";
import { IconoChispa } from "@/components/ui/chispa";
import { EscenaParallax, useConfeti } from "@/components/ui/motion";
import { type DiapositivaPase, PaseAutomatico } from "@/components/ui/pase-automatico";
import { Muestra, Seccion } from "../seccion";

/** Pase de ejemplo con bloques de color: en el catálogo no hay fotos de nadie que enseñar. */
const DIAPOSITIVAS: DiapositivaPase[] = ["bg-acento", "bg-chispa", "bg-degradado-escenario"].map((fondo, i) => ({
  clave: fondo,
  contenido: (
    <div className={`flex size-full items-center justify-center ${fondo} text-lg font-bold text-white`}>{i + 1}</div>
  ),
}));

export function SeccionMovimiento() {
  const { lanzar, confeti } = useConfeti();
  return (
    <Seccion
      id="movimiento"
      titulo="Movimiento"
      descripcion="Parallax por capas y celebraciones en hitos reales. Con «reducir movimiento» activado, todo queda estático."
    >
      <div className="grid gap-4">
        <Muestra titulo="Escena parallax (haz scroll)">
          <EscenaParallax
            className="h-80 w-full rounded-tarjeta bg-degradado-escenario"
            capas={[
              {
                id: "chispa-grande",
                velocidad: -120,
                className: "top-6 left-[8%] text-white/70",
                contenido: <IconoChispa className="size-16" />,
              },
              {
                id: "chispa-sol",
                velocidad: 80,
                className: "top-24 right-[12%] text-v-sol",
                contenido: <IconoChispa className="size-24" />,
              },
              {
                id: "chispa-pequena",
                velocidad: -60,
                className: "bottom-4 left-[40%] text-white/50",
                contenido: <IconoChispa className="size-10" />,
              },
              {
                id: "marco",
                velocidad: 40,
                className: "top-10 right-[35%] h-40 w-24 rounded-tarjeta border-4 border-white/70",
                contenido: null,
              },
            ]}
          >
            <div className="flex h-80 flex-col items-center justify-center text-center text-white">
              <p className="text-4xl font-bold drop-shadow">Da vida a cada escena</p>
              <p className="mt-2 text-lg font-semibold opacity-90">Crea personajes, dirige historias</p>
            </div>
          </EscenaParallax>
        </Muestra>
        <Muestra titulo="Pase automático (lo mueve CSS: se para al pasar el ratón o al enfocar dentro)">
          <PaseAutomatico
            diapositivas={DIAPOSITIVAS}
            etiqueta="Ejemplo de pase automático"
            className="aspect-square w-40 rounded-tarjeta"
          />
        </Muestra>
        <Muestra titulo="Celebración">
          <Boton variante="chispa" icono={<PartyPopper className="size-5" />} onClick={lanzar}>
            Aprobar personaje
          </Boton>
          {confeti}
        </Muestra>
      </div>
    </Seccion>
  );
}
