"use client";

import { useState } from "react";
import { ControlRecorte } from "@/components/ui/montaje/control-recorte";
import { ControlVolumen } from "@/components/ui/montaje/control-volumen";
import { PrevisualizacionVertical } from "@/components/ui/montaje/previsualizacion-vertical";
import { POSICIONES_ETIQUETA } from "@/lib/montaje";
import { recortar } from "@/lib/montaje-pantalla";
import { Muestra, Seccion } from "../seccion";

/**
 * Los componentes del **montaje** (0.32.0): el marco vertical con sus zonas seguras, el recorte de un trozo de clip
 * y el volumen de una pista.
 *
 * Están en el catálogo porque el marco vertical lo usan tres pantallas —montaje, subtítulos y producción— y porque
 * el recorte es donde se decide si alguien puede montar su vídeo **sin ratón**: las manecillas son `input
 * type="range"`, así que el teclado ya funciona, y cada una lleva además su campo numérico.
 */
export function SeccionMontaje() {
  const [fragmento, setFragmento] = useState({ clave: "demo", escenaId: "e1", entrada: 1.5, salida: 6 });
  const [voz, setVoz] = useState(1);

  return (
    <Seccion
      id="montaje"
      titulo="Montaje y exportación"
      descripcion="El marco vertical con las zonas seguras que tapan TikTok, Reels y Shorts; el recorte de entrada y salida con manecillas y campos numéricos; y el volumen de una pista de 0 % a 200 %."
    >
      <div className="flex flex-col gap-4">
        <Muestra titulo="Marco vertical 9:16 con zonas seguras">
          <PrevisualizacionVertical
            className="w-40"
            vacio="Sin clip todavía: el marco y sus zonas se dibujan igual, porque son del formato."
            pie="Sin clip."
          />
          {POSICIONES_ETIQUETA.map((posicion) => (
            <PrevisualizacionVertical
              key={posicion}
              className="w-40"
              etiqueta={posicion}
              vacio="Aquí iría el clip de la escena."
              pie={`Etiqueta de contenido sintético ${posicion}, dentro de la zona visible.`}
            />
          ))}
        </Muestra>

        <Muestra titulo="Recorte de un trozo de clip">
          <div className="w-full max-w-xl">
            <ControlRecorte
              entrada={fragmento.entrada}
              salida={fragmento.salida}
              duracion={8}
              nombre="la escena 2"
              onCambio={(borde, segundos) => setFragmento((f) => recortar(f, borde, segundos, 8))}
            />
          </div>
        </Muestra>

        <Muestra titulo="Volumen de una pista">
          <div className="w-full max-w-xl">
            <ControlVolumen
              etiqueta="Voz"
              ayuda="Va de 0 % a 200 %. Se guarda en tanto por uno, que es como lo aplica FFmpeg al mezclar."
              valor={voz}
              onCambio={setVoz}
            />
          </div>
        </Muestra>

        <Muestra titulo="Deshabilitados">
          <div className="w-full max-w-xl">
            <ControlVolumen etiqueta="Música" valor={0.3} deshabilitado onCambio={() => undefined} />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
