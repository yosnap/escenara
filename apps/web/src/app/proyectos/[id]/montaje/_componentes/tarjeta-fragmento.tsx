"use client";

import { ChevronDown, ChevronUp, Mic, Subtitles, Trash2, VolumeX } from "lucide-react";
import { Boton, BotonIcono } from "@/components/ui/button";
import { ControlRecorte } from "@/components/ui/montaje/control-recorte";
import { PrevisualizacionVertical } from "@/components/ui/montaje/previsualizacion-vertical";
import type { EscenaMontableVista } from "@/lib/montaje";
import type { FragmentoEditable } from "@/lib/montaje-pantalla";

/**
 * Un trozo de clip en la línea de tiempo: de qué escena es, cómo se ve con las zonas seguras encima y hasta dónde
 * está recortado.
 *
 * El asa para arrastrar y el número de posición los pone la lista (`components/ui/lista-ordenable.tsx`). Aquí están
 * los botones de subir y bajar, que hacen **lo mismo** que arrastrar: no todo el mundo puede arrastrar, y con el
 * asa hay que saber que `Espacio` la coge.
 */
export function TarjetaFragmento({
  fragmento,
  escena,
  posicion,
  total,
  deshabilitado,
  onRecorte,
  onMover,
  onQuitar,
}: {
  fragmento: FragmentoEditable;
  /** La escena del fragmento, o `null` si ya no está en el proyecto. */
  escena: EscenaMontableVista | null;
  posicion: number;
  total: number;
  deshabilitado?: boolean;
  onRecorte: (borde: "entrada" | "salida", segundos: number) => void;
  onMover: (desplazamiento: -1 | 1) => void;
  onQuitar: () => void;
}) {
  const nombre = escena ? `la escena ${escena.orden}` : `el fragmento ${posicion}`;
  const subtitulos = escena?.subtitulos.filter((s) => s.texto.trim() !== "").length ?? 0;

  return (
    <div className="flex flex-1 flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-4 sm:flex-row">
      <PrevisualizacionVertical
        className="w-full shrink-0 sm:w-40"
        src={escena?.medioClip?.url}
        vacio={
          escena
            ? "Esta escena ya no tiene clip guardado. Vuelve a producirla o quita el fragmento."
            : "Este fragmento apunta a una escena que ya no está en el proyecto."
        }
        pie="Las franjas rayadas son lo que la aplicación tapa en vertical."
      />

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-bold text-texto">
              {escena ? `Escena ${escena.orden}` : `Fragmento ${posicion}`}
              <span className="ml-2 font-normal text-sm text-texto-suave">
                posición {posicion} de {total}
              </span>
            </h3>
            {escena && <p className="mt-0.5 truncate text-sm text-texto-suave">{escena.resumen}</p>}
            <p className="mt-1 flex flex-wrap gap-3 text-xs text-texto-suave">
              {escena?.tieneVoz && (
                <span className="inline-flex items-center gap-1">
                  <Mic className="size-3.5" aria-hidden /> Con pista de voz
                </span>
              )}
              {/* Se decide en el paso de escenas del proyecto; aquí solo se dice, para que el MP4 no sorprenda. */}
              {escena?.audioDelClipQuitado && (
                <span className="inline-flex items-center gap-1">
                  <VolumeX className="size-3.5" aria-hidden /> Sin el audio del clip
                </span>
              )}
              {subtitulos > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Subtitles className="size-3.5" aria-hidden /> {subtitulos}{" "}
                  {subtitulos === 1 ? "subtítulo" : "subtítulos"}
                </span>
              )}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <BotonIcono
              etiqueta={`Subir ${nombre} una posición`}
              disabled={deshabilitado || posicion === 1}
              onClick={() => onMover(-1)}
            >
              <ChevronUp className="size-4" aria-hidden />
            </BotonIcono>
            <BotonIcono
              etiqueta={`Bajar ${nombre} una posición`}
              disabled={deshabilitado || posicion === total}
              onClick={() => onMover(1)}
            >
              <ChevronDown className="size-4" aria-hidden />
            </BotonIcono>
            <Boton
              variante="fantasma"
              tamano="sm"
              icono={<Trash2 className="size-4" aria-hidden />}
              disabled={deshabilitado}
              onClick={onQuitar}
            >
              Quitar
              <span className="sr-only"> {nombre} de la línea de tiempo</span>
            </Boton>
          </div>
        </div>

        <ControlRecorte
          entrada={fragmento.entrada}
          salida={fragmento.salida}
          duracion={escena?.duracionClip ?? null}
          nombre={nombre}
          deshabilitado={deshabilitado}
          onCambio={onRecorte}
        />
      </div>
    </div>
  );
}
