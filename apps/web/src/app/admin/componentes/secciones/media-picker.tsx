"use client";

import { useState } from "react";
import { BarraEspacio } from "@/components/ui/media/barra-espacio";
import { BibliotecaMedios } from "@/components/ui/media/biblioteca-medios";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import { VisorMedio } from "@/components/ui/media/visor-medio";
import type { Medio } from "@/lib/media/tipos";
import { Muestra, Seccion } from "../seccion";

/** Imagen de muestra en la proporción indicada, sin depender de ningún archivo del almacenamiento. */
function medioDeMuestra(nombre: string, ancho: number, alto: number): Medio {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%23ff5a5f"/><stop offset="100%" stop-color="%23ffc94d"/></linearGradient></defs><rect width="${ancho}" height="${alto}" fill="url(%23g)"/><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="${Math.round(Math.min(ancho, alto) / 6)}" fill="%23182032">${nombre}</text></svg>`;
  return {
    id: `muestra-${nombre}`,
    tipo: "imagen",
    nombre: `muestra-${nombre}.svg`,
    mime: "image/svg+xml",
    tamano: svg.length,
    ancho,
    alto,
    duracion: null,
    titulo: `Muestra ${nombre}`,
    altEs: `Rectángulo de muestra en proporción ${nombre}`,
    altEn: "",
    url: `data:image/svg+xml;charset=utf-8,${svg}`,
    creadoEn: new Date().toISOString(),
    actualizadoEn: new Date().toISOString(),
    enPapelera: false,
    origen: null,
    permisos: { editarImagen: false, borrarDefinitivo: false },
  };
}

const MUESTRAS = [
  medioDeMuestra("9:16", 1080, 1920),
  medioDeMuestra("4:5", 1080, 1350),
  medioDeMuestra("1:1", 1080, 1080),
  medioDeMuestra("16:9", 1920, 1080),
];

export function SeccionMediaPicker() {
  const [retrato, setRetrato] = useState<Medio[]>([]);
  const [escena, setEscena] = useState<Medio[]>([]);

  return (
    <Seccion
      id="media-picker"
      titulo="Selector de medios"
      descripcion="Elige o sube fotos, vídeos y audios. Las imágenes pueden recortarse, girarse y voltearse al subirlas o desde la biblioteca. Funciona con archivos reales en el almacenamiento local."
    >
      <div className="flex flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <Muestra titulo="Un solo medio · solo imágenes">
            <div className="w-full">
              <SelectorMedios
                etiqueta="Foto de referencia del personaje"
                ayuda="Una foto nítida, de frente y con buena luz."
                tipos={["imagen"]}
                valor={retrato}
                onCambio={setRetrato}
              />
            </div>
          </Muestra>
          <Muestra titulo="Varios medios · imagen, vídeo y audio">
            <div className="w-full">
              <SelectorMedios etiqueta="Material de la escena" multiple valor={escena} onCambio={setEscena} />
            </div>
          </Muestra>
        </div>
        <Muestra titulo="Espacio usado (normal, casi lleno y sin límite)">
          <div className="grid w-full gap-3 md:grid-cols-3">
            <BarraEspacio espacio={{ usadoBytes: 700 * 1024 * 1024, cuotaBytes: 2048 * 1024 * 1024 }} />
            <BarraEspacio espacio={{ usadoBytes: 1950 * 1024 * 1024, cuotaBytes: 2048 * 1024 * 1024 }} />
            <BarraEspacio espacio={{ usadoBytes: 5 * 1024 * 1024 * 1024, cuotaBytes: null }} />
          </div>
        </Muestra>
        <Muestra titulo="Visor: el medio completo, nunca recortado">
          <div className="flex w-full flex-wrap items-end justify-center gap-4">
            {MUESTRAS.map((medio) => (
              <div key={medio.id} className="flex flex-col items-center gap-2">
                <VisorMedio medio={medio} alturaMaxima="14rem" />
                <span className="text-sm text-texto-suave">{medio.titulo}</span>
              </div>
            ))}
          </div>
        </Muestra>
        <Muestra titulo="Biblioteca en modo gestión">
          <div className="w-full">
            <BibliotecaMedios />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
