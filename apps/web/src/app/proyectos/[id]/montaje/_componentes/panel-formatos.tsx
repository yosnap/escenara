"use client";

import { Ratio } from "lucide-react";
import { SelectorFormatos } from "@/components/ui/formatos";
import { ControlEncuadre } from "@/components/ui/montaje/control-encuadre";
import { PrevisualizacionFormato } from "@/components/ui/montaje/previsualizacion-formato";
import { Pestanas } from "@/components/ui/overlay";
import {
  type Encuadre,
  type EncuadresDelMontaje,
  encuadreAutomatico,
  encuadreDe,
  type FormatoMontaje,
  mismoEncuadre,
  PESTANA_DE_FORMATO,
} from "@/lib/formatos";
import type { EscenaMontableVista, PosicionEtiqueta } from "@/lib/montaje";
import type { FragmentoEditable } from "@/lib/montaje-pantalla";

/**
 * **Formatos y encuadre** del montaje (0.41.0): en qué formatos sale el vídeo y qué parte de cada clip entra en
 * cada uno.
 *
 * Todo lo que se hace aquí es **gratis y no regenera nada**: los formatos que no son el principal se sacan del
 * mismo clip con reencuadre. Añadir o quitar un formato se guarda al momento (es una lista del proyecto); el
 * encuadre va con el borrador del montaje, porque cambia los píxeles del MP4 y se guarda con la línea de tiempo.
 */
export function PanelFormatos({
  formatos,
  encuadres,
  fragmentos,
  escenas,
  etiquetaPosicion,
  deshabilitado,
  onFormatos,
  onEncuadres,
}: {
  formatos: readonly FormatoMontaje[];
  encuadres: EncuadresDelMontaje;
  fragmentos: readonly FragmentoEditable[];
  escenas: readonly EscenaMontableVista[];
  etiquetaPosicion: PosicionEtiqueta;
  deshabilitado?: boolean;
  onFormatos: (formatos: FormatoMontaje[]) => void;
  onEncuadres: (encuadres: EncuadresDelMontaje) => void;
}) {
  const porId = new Map(escenas.map((e) => [e.escenaId, e]));

  /** Guarda el encuadre de una escena en un formato; el automático no se guarda (es lo que ya hay sin nada). */
  const cambiarEncuadre = (formato: FormatoMontaje, escenaId: string, encuadre: Encuadre) => {
    const suyos = { ...(encuadres[formato] ?? {}) };
    if (mismoEncuadre(encuadre, encuadreAutomatico(formato))) delete suyos[escenaId];
    else suyos[escenaId] = encuadre;
    const siguientes: EncuadresDelMontaje = { ...encuadres, [formato]: suyos };
    if (Object.keys(suyos).length === 0) delete siguientes[formato];
    onEncuadres(siguientes);
  };

  return (
    <section
      aria-labelledby="formatos-montaje"
      className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-4"
    >
      <div>
        <h2 id="formatos-montaje" className="flex items-center gap-2 text-2xl font-bold text-texto">
          <Ratio className="size-6 text-acento" aria-hidden />
          Formatos y encuadre
        </h2>
        <p className="mt-1 text-texto-suave">
          El mismo montaje sale en cada formato que marques. Los clips{" "}
          <strong className="text-texto">no se vuelven a generar</strong>: se reencuadran con FFmpeg en esta máquina y
          no cuesta créditos. El principal es en el que se generaron.
        </p>
      </div>

      <SelectorFormatos
        etiqueta="Formatos de este proyecto"
        formatos={formatos}
        deshabilitado={deshabilitado}
        onCambio={onFormatos}
      />

      <Pestanas
        pestanas={formatos.map((formato) => ({
          valor: formato,
          etiqueta: PESTANA_DE_FORMATO[formato],
          contenido: (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-texto-suave">
                Arrastra cada vídeo para elegir qué parte se queda, o usa los atajos. Las franjas discontinuas son lo
                que tapa la interfaz de la plataforma: los subtítulos y la etiqueta se colocan fuera de ellas.
              </p>
              <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {fragmentos.map((fragmento, indice) => {
                  const escena = porId.get(fragmento.escenaId);
                  const encuadre = encuadreDe(encuadres, formato, fragmento.escenaId);
                  const medidas = { ancho: escena?.medioClip?.ancho ?? null, alto: escena?.medioClip?.alto ?? null };
                  return (
                    <li key={fragmento.clave} className="flex flex-col gap-2">
                      <PrevisualizacionFormato
                        formato={formato}
                        src={escena?.medioClip?.url}
                        medidas={medidas}
                        encuadre={encuadre}
                        etiqueta={etiquetaPosicion}
                        onEncuadre={deshabilitado ? undefined : (e) => cambiarEncuadre(formato, fragmento.escenaId, e)}
                        pie={`Fragmento ${indice + 1} · escena ${escena?.orden ?? "?"}`}
                      />
                      <ControlEncuadre
                        formato={formato}
                        encuadre={encuadre}
                        ajustado={encuadres[formato]?.[fragmento.escenaId] !== undefined}
                        medidas={medidas}
                        deshabilitado={deshabilitado}
                        onCambio={(e) => cambiarEncuadre(formato, fragmento.escenaId, e)}
                      />
                    </li>
                  );
                })}
              </ol>
            </div>
          ),
        }))}
      />
    </section>
  );
}
