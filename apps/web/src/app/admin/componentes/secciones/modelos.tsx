"use client";

import { useState } from "react";
import { AvisoSinVoz, FichaModelo, InsigniaEstadoModelo, SelectorModelo } from "@/components/ui/modelo";
import { ESTADOS_MODELO, type ModeloVista, recortarModelo } from "@/lib/catalogo";
import { Muestra, Seccion } from "../seccion";

/** Modelos de ejemplo con los datos reales del catálogo sembrado, para ver la ficha sin tocar la base. */
const VEO: ModeloVista = {
  id: "ejemplo-veo",
  proveedor: "kie",
  nombreProveedor: "KIE.ai",
  modelo: "veo3_lite",
  nombre: "Veo 3.1 Lite",
  capacidades: ["image_to_video", "text_to_video"],
  estado: "validado",
  conVoz: true,
  unidad: "vídeo de 4 s",
  parametros: {
    duraciones: [4, 6, 8],
    proporciones: ["9:16"],
    resoluciones: ["720p", "1080p"],
    formatosReferencia: ["image/jpeg", "image/png", "image/webp"],
    maximoReferencias: 2,
  },
  notas: "Único modelo con voz validado: dice la frase de «Lo que dice» con labios sincronizados.",
  evidencia: "60 créditos por clip de 4 s medidos en el prototipo 0.3.0; clip real comprobado en la 0.10.1.",
  version: 1,
  predeterminado: true,
  precio: {
    unidad: "vídeo de 4 s",
    creditos: 60,
    fuente: "Medido con la cuenta de KIE del propietario",
    comprobado: "2026-09-27",
    sello: "kie:veo3_lite:vídeo de 4 s@v1",
    caducado: false,
  },
  actualizado: "2026-09-27T00:00:00.000Z",
};

const HAILUO: ModeloVista = {
  ...VEO,
  id: "ejemplo-hailuo",
  modelo: "hailuo/2-3-image-to-video-standard",
  nombre: "Hailuo 2.3 Standard",
  capacidades: ["image_to_video"],
  estado: "compatible",
  conVoz: false,
  unidad: "vídeo de 6 s",
  parametros: {
    ...VEO.parametros,
    duraciones: [6, 10],
    proporciones: [],
    resoluciones: ["768P", "1080P"],
    maximoReferencias: 1,
  },
  notas: "El más barato por segundo, pero sin voz: no sirve para que el personaje hable.",
  evidencia: "",
  predeterminado: false,
  precio: {
    unidad: "vídeo de 6 s",
    creditos: 30,
    fuente: "Comparativa real del 2026-09-27",
    comprobado: "2026-01-10",
    sello: "kie:hailuo/2-3-image-to-video-standard:vídeo de 6 s@v1",
    caducado: true,
  },
};

/** Catálogo de modelos: insignias de estado, ficha legible y selector por capacidad. */
export function SeccionModelos() {
  const [elegido, setElegido] = useState(VEO.modelo);
  return (
    <Seccion
      id="modelos"
      titulo="Catálogo de modelos"
      descripcion="La ficha de un modelo es zona de claridad: qué hace, qué necesita, cuánto cuesta y cuándo se comprobó ese precio. Un modelo sin voz lo dice claramente, y a los 90 días sin comprobar el precio se avisa."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <Muestra titulo="Estados de un modelo">
            <div className="flex flex-wrap gap-2">
              {ESTADOS_MODELO.map((estado) => (
                <InsigniaEstadoModelo key={estado} estado={estado} />
              ))}
            </div>
          </Muestra>
          <Muestra titulo="Selector de modelo por capacidad">
            <div className="w-full">
              <SelectorModelo
                etiqueta="Modelo del clip"
                modelos={[VEO, HAILUO].map(recortarModelo)}
                valor={elegido}
                onCambio={setElegido}
              />
            </div>
          </Muestra>
          <Muestra titulo="Aviso de modelo sin voz">
            <div className="w-full">
              <AvisoSinVoz />
            </div>
          </Muestra>
        </div>
        <Muestra titulo="Ficha de modelo">
          <div className="w-full">
            <FichaModelo modelo={elegido === HAILUO.modelo ? HAILUO : VEO} />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
