import type { Metadata } from "next";
import type { MarcaAplicada } from "./publicada";

/**
 * El icono de Escenara va en `public/icon.svg` y se declara aquí, no como `app/icon.svg`: el icono por fichero de Next
 * manda sobre los metadatos y no dejaría que una marca publicada pusiera el suyo.
 */
export const METADATOS_DE_ESCENARA: Metadata = {
  // Cada página pone solo su parte («Tus personajes») y la plantilla añade el nombre de la instalación.
  title: { default: "Escenara · Da vida a cada escena", template: "%s · Escenara" },
  description: "Estudio abierto de personajes y vídeo",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml", sizes: "any" }] },
};

/**
 * Metadatos de la página. Sin marca publicada, los de siempre. Con ella, su nombre, su lema y los iconos que se
 * generaron al publicarla (sin logotipos subidos, el icono de Escenara). Next escapa estos textos al escribir el HTML.
 */
export function metadatosDeLaMarca(marca: MarcaAplicada | null): Metadata {
  if (!marca) return METADATOS_DE_ESCENARA;
  const { favicon16, favicon32, icono192, icono512, social } = marca.iconos;
  return {
    title: { default: `${marca.nombre} · ${marca.lema}`, template: `%s · ${marca.nombre}` },
    description: marca.descripcion,
    icons: favicon32
      ? {
          icon: [
            ...(favicon16 ? [{ url: favicon16, sizes: "16x16", type: "image/png" }] : []),
            { url: favicon32, sizes: "32x32", type: "image/png" },
          ],
          ...(icono192 ? { apple: [{ url: icono192, sizes: "192x192", type: "image/png" }] } : {}),
        }
      : METADATOS_DE_ESCENARA.icons,
    ...(icono192 && icono512 ? { manifest: "/api/marca/manifest" } : {}),
    ...(social ? { openGraph: { title: marca.nombre, description: marca.descripcion, images: [social] } } : {}),
  };
}
