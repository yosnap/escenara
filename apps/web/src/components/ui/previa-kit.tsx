import { FORMATO_MONTAJE_POR_DEFECTO, ZONA_SEGURA_DE_FORMATO } from "@/lib/formatos";
import {
  type EsquinaKit,
  esquinaEfectiva,
  franjaDe,
  LOGO_ALTO_MAXIMO,
  LOGO_ANCHO_MAXIMO,
  ladoDe,
  NOMBRE_ESQUINA,
} from "@/lib/marca-kit";
import { type PosicionEtiqueta, TEXTO_ETIQUETA_SINTETICA } from "@/lib/montaje";

/** Margen del render (32 px de 1080 de ancho y 16 px de 1920 de alto), en porcentaje del cuadro. */
const MARGEN_LATERAL = (32 / 1080) * 100;
const MARGEN_VERTICAL = (16 / 1920) * 100;

/**
 * **Previsualización del kit del creador** sobre un fotograma real en 9:16: el logotipo en su esquina y la etiqueta de
 * contenido generado con IA donde la pondrá el montaje. Usa la misma regla que el render: si la esquina elegida cae en
 * la franja de la etiqueta, el logotipo pasa a la contraria y la etiqueta queda siempre a la vista.
 */
export function PreviaKit({
  fotograma,
  logo,
  esquina,
  etiqueta,
}: {
  fotograma: string;
  logo: string | null;
  esquina: EsquinaKit;
  etiqueta: PosicionEtiqueta;
}) {
  const zona = ZONA_SEGURA_DE_FORMATO[FORMATO_MONTAJE_POR_DEFECTO];
  const efectiva = esquinaEfectiva(esquina, etiqueta);
  const arriba = zona.arribaPorCiento + MARGEN_VERTICAL;
  const abajo = zona.abajoPorCiento + MARGEN_VERTICAL;
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative aspect-[9/16] w-full max-w-72 overflow-hidden rounded-tarjeta border border-borde bg-elevada">
        {/* biome-ignore lint/performance/noImgElement: fotograma del usuario servido por nuestra ruta de medios */}
        <img src={fotograma} alt="Fotograma de muestra" className="absolute inset-0 size-full object-cover" />
        {logo && (
          <div
            data-esquina-logo={efectiva}
            className="absolute flex"
            style={{
              width: `${LOGO_ANCHO_MAXIMO * 100}%`,
              height: `${LOGO_ALTO_MAXIMO * 100}%`,
              [ladoDe(efectiva) === "izquierda" ? "left" : "right"]: `${MARGEN_LATERAL}%`,
              [franjaDe(efectiva) === "arriba" ? "top" : "bottom"]:
                `${franjaDe(efectiva) === "arriba" ? arriba : abajo}%`,
              justifyContent: ladoDe(efectiva) === "izquierda" ? "flex-start" : "flex-end",
              alignItems: franjaDe(efectiva) === "arriba" ? "flex-start" : "flex-end",
            }}
          >
            {/* biome-ignore lint/performance/noImgElement: logotipo del kit servido por nuestra ruta */}
            <img src={logo} alt="Tu logotipo" className="max-h-full max-w-full object-contain" />
          </div>
        )}
        <span
          data-etiqueta={etiqueta}
          className="absolute left-1/2 -translate-x-1/2 rounded bg-black/55 px-2 py-1 text-[0.6rem] font-semibold whitespace-nowrap text-white"
          style={etiqueta === "arriba" ? { top: `${arriba}%` } : { bottom: `${abajo}%` }}
        >
          {TEXTO_ETIQUETA_SINTETICA}
        </span>
      </div>
      <figcaption className="text-sm text-texto-suave">
        {logo
          ? efectiva === esquina
            ? `Tu logotipo va ${NOMBRE_ESQUINA[efectiva].toLowerCase()}.`
            : `Con la etiqueta ${etiqueta}, tu logotipo pasa a ${NOMBRE_ESQUINA[efectiva].toLowerCase()} para no taparla.`
          : "Sube un logotipo para verlo sobre el fotograma."}
      </figcaption>
    </figure>
  );
}
