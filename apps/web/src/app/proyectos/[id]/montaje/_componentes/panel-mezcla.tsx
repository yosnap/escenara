"use client";

import { Lock } from "lucide-react";
import { GrupoOpciones, Interruptor } from "@/components/ui/choice";
import { ControlVolumen } from "@/components/ui/montaje/control-volumen";
import { PrevisualizacionVertical } from "@/components/ui/montaje/previsualizacion-vertical";
import {
  ETIQUETA_POSICION,
  esPosicionEtiqueta,
  type MontajeVista,
  POSICIONES_ETIQUETA,
  type PosicionEtiqueta,
} from "@/lib/montaje";
import type { BorradorMontaje } from "@/lib/montaje-pantalla";
import { esFormatoSubtitulos } from "@/lib/voz";

/**
 * Mezcla y subtítulos: los volúmenes de voz y de música, si los subtítulos se queman o se adjuntan, y la
 * **etiqueta de contenido sintético**.
 *
 * La etiqueta va en su propia **zona de claridad**: sin degradados y sin animación, como las cifras de coste y los
 * consentimientos. Cuando es obligatoria el interruptor no se puede apagar y se dice por qué con el texto del
 * servidor (`MOTIVO_ETIQUETA_OBLIGATORIA`), no con una frase distinta escrita aquí.
 */
export function PanelMezcla({
  borrador,
  montaje,
  deshabilitado,
  onCambio,
}: {
  borrador: BorradorMontaje;
  montaje: MontajeVista;
  deshabilitado?: boolean;
  onCambio: <K extends keyof BorradorMontaje>(clave: K, valor: BorradorMontaje[K]) => void;
}) {
  const hayVoz = montaje.escenas.some((e) => e.tieneVoz);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section
        aria-labelledby="mezcla"
        className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-4"
      >
        <div>
          <h2 id="mezcla" className="text-2xl font-bold text-texto">
            Mezcla y subtítulos
          </h2>
          <p className="mt-1 text-texto-suave">
            Los volúmenes se aplican al montar: los clips y las pistas se quedan como están en tu biblioteca.
          </p>
        </div>

        <ControlVolumen
          etiqueta="Voz"
          ayuda={
            hayVoz
              ? "La pista de voz de las escenas que la tienen. Al 0 % el montaje sale sin voz."
              : "Ninguna escena tiene pista de voz aparte, así que esto solo afecta al audio que ya traen los clips."
          }
          valor={borrador.volumenVoz}
          deshabilitado={deshabilitado}
          onCambio={(v) => onCambio("volumenVoz", v)}
        />
        <ControlVolumen
          etiqueta="Música"
          ayuda="La música autorizada del proyecto. Por debajo del 30 % suele dejar oír bien la voz."
          valor={borrador.volumenMusica}
          deshabilitado={deshabilitado}
          onCambio={(v) => onCambio("volumenMusica", v)}
        />

        <Interruptor
          etiqueta="Quemar los subtítulos en el vídeo"
          descripcion="Apagado, el MP4 sale limpio y los subtítulos se descargan aparte, que es lo que prefieren TikTok, Reels y Shorts para poner los suyos. Encendido, van dibujados y no se pueden quitar después."
          activo={borrador.subtitulosQuemados}
          deshabilitado={deshabilitado}
          onCambio={(v) => onCambio("subtitulosQuemados", v)}
        />
        <GrupoOpciones
          etiqueta="Formato del fichero de subtítulos"
          valor={borrador.formatoSubtitulos}
          onCambio={(v) => {
            if (esFormatoSubtitulos(v)) onCambio("formatoSubtitulos", v);
          }}
          opciones={[
            {
              value: "srt",
              etiqueta: "SRT",
              descripcion: "El que aceptan casi todas las plataformas.",
            },
            {
              value: "vtt",
              etiqueta: "WebVTT",
              descripcion: "El de la web y los reproductores de vídeo HTML.",
            },
          ]}
        />
        <p className="text-sm text-texto-suave">
          Los subtítulos son los que has editado en Voz y subtítulos, con los tiempos corridos según el recorte de cada
          fragmento. Se adjuntan siempre, también si los quemas.
        </p>
      </section>

      {/* Zona de claridad: la etiqueta declara qué es el vídeo, así que se explica sin adornos. */}
      <section
        aria-labelledby="etiqueta"
        className="flex flex-col gap-4 rounded-tarjeta border-2 border-borde bg-superficie p-4"
      >
        <div>
          <h2 id="etiqueta" className="text-2xl font-bold text-texto">
            Etiqueta de contenido sintético
          </h2>
          <p className="mt-1 text-texto-suave">
            Un rótulo fijo sobre el vídeo que dice que se ha generado con IA. El texto no se puede cambiar: es una
            declaración, no un elemento de diseño.
          </p>
        </div>

        {montaje.etiquetaObligatoria && (
          <div role="status" className="flex gap-3 rounded-tarjeta border-2 border-borde bg-elevada p-3">
            <span aria-hidden className="mt-0.5 shrink-0 text-texto-suave">
              <Lock className="size-5" />
            </span>
            <p className="text-texto">{montaje.motivoEtiqueta}</p>
          </div>
        )}

        <Interruptor
          etiqueta="Poner la etiqueta en el vídeo exportado"
          descripcion="En toda exportación de Escenara es obligatoria, también en vídeos animados. Puedes elegir dónde va."
          activo={montaje.etiquetaObligatoria ? true : borrador.etiquetaVisible}
          deshabilitado={deshabilitado || montaje.etiquetaObligatoria}
          onCambio={(v) => onCambio("etiquetaVisible", v)}
        />

        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <GrupoOpciones
            etiqueta="Dónde va la etiqueta"
            valor={borrador.etiquetaPosicion}
            onCambio={(v) => {
              if (esPosicionEtiqueta(v)) onCambio("etiquetaPosicion", v);
            }}
            opciones={POSICIONES_ETIQUETA.map((posicion: PosicionEtiqueta) => ({
              value: posicion,
              etiqueta: ETIQUETA_POSICION[posicion],
            }))}
          />
          <PrevisualizacionVertical
            etiqueta={borrador.etiquetaVisible || montaje.etiquetaObligatoria ? borrador.etiquetaPosicion : null}
            vacio="Así se verá la etiqueta sobre el vídeo."
            pie="Va siempre dentro de la zona que la aplicación no tapa."
          />
        </div>
      </section>
    </div>
  );
}
