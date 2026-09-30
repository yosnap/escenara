"use client";

import { useState } from "react";
import { TarjetaClipProducido, TarjetaConvertirEnProyecto } from "@/components/ui/conversion";
import type { ClipProducidoVista } from "@/lib/audio-del-clip";
import type { Medio } from "@/lib/media/tipos";
import { Muestra, Seccion } from "../seccion";

/** Un clip de muestra sin archivo: el marco vertical dice que no hay vídeo en lugar de pedir uno. */
const MEDIO: Medio = {
  id: "muestra",
  tipo: "video",
  nombre: "clip.mp4",
  mime: "video/mp4",
  tamano: 0,
  ancho: 1080,
  alto: 1920,
  duracion: 8,
  titulo: "",
  altEs: "",
  altEn: "",
  url: "",
  creadoEn: "2026-09-30T08:00:00.000Z",
  actualizadoEn: "2026-09-30T08:00:00.000Z",
  enPapelera: false,
  origen: null,
  documento: false,
  permisos: { editarImagen: true, borrarDefinitivo: true },
};

const CLIP: ClipProducidoVista = {
  escenaId: "e1",
  orden: 1,
  medio: MEDIO,
  hablaEnElClip: true,
  audioQuitado: false,
  conPistaDeVoz: false,
  conDialogo: true,
};

/**
 * **De «Crear» a un proyecto** (0.35.0): el botón que convierte un clip terminado en un proyecto de una escena, en
 * sus cuatro estados, y la tarjeta del clip ya producido con sus acciones de audio.
 */
export function SeccionConversion() {
  const [quitado, setQuitado] = useState(false);

  return (
    <Seccion
      id="conversion"
      titulo="De Crear a un proyecto"
      descripcion="El botón «Convertir en proyecto» nunca se oculta: si el clip no se puede convertir dice por qué, y si ya se convirtió lleva a su proyecto. La tarjeta del clip producido dice qué se va a oír y permite quitar el audio del clip o ponerle voz en off."
    >
      <div className="flex flex-col gap-4">
        <Muestra titulo="Convertible, con un aviso">
          <div className="w-full max-w-2xl">
            <TarjetaConvertirEnProyecto
              estado={{
                estado: "convertible",
                avisos: [
                  "El trend «Unboxing» ha caducado y ya no puede generar. El clip se conserva tal cual; para regenerar la escena dentro del proyecto tendrás que elegir otro trend.",
                ],
              }}
            />
          </div>
        </Muestra>
        <Muestra titulo="Comprobando y convirtiendo">
          <div className="grid w-full max-w-2xl gap-4">
            <TarjetaConvertirEnProyecto estado={null} />
            <TarjetaConvertirEnProyecto estado={{ estado: "convertible", avisos: [] }} convirtiendo />
          </div>
        </Muestra>
        <Muestra titulo="No se puede, con su motivo">
          <div className="w-full max-w-2xl">
            <TarjetaConvertirEnProyecto
              estado={{
                estado: "no_convertible",
                motivo: "El clip todavía se está generando. Cuando esté listo podrás convertirlo en proyecto.",
              }}
            />
          </div>
        </Muestra>
        <Muestra titulo="Ya convertido">
          <div className="w-full max-w-2xl">
            <TarjetaConvertirEnProyecto
              estado={{ estado: "convertido", proyectoId: "p1", titulo: "«Unboxing» desde Crear", url: "#conversion" }}
            />
          </div>
        </Muestra>
        <Muestra titulo="Clip producido: quitar el audio o poner voz en off">
          <div className="w-full max-w-2xl">
            <TarjetaClipProducido
              clip={{ ...CLIP, audioQuitado: quitado }}
              modoVoz="clip"
              proyectoId="p1"
              onQuitarAudio={setQuitado}
            />
          </div>
        </Muestra>
        <Muestra titulo="Pista de voz aparte con el clip hablando: dos voces">
          <div className="w-full max-w-2xl">
            <TarjetaClipProducido clip={{ ...CLIP, conPistaDeVoz: true }} modoVoz="pista" proyectoId="p1" ocupado />
          </div>
        </Muestra>
      </div>
    </Seccion>
  );
}
