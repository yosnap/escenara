"use client";

import { useState } from "react";
import { BibliotecaMedios } from "@/components/ui/media/biblioteca-medios";
import { SelectorMedios } from "@/components/ui/media/selector-medios";
import type { Medio } from "@/lib/media/tipos";
import { Muestra, Seccion } from "../seccion";

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
        <Muestra titulo="Biblioteca en modo gestión">
          <div className="w-full">
            <BibliotecaMedios />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
