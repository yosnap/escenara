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
  // El SVG es el dibujo simplificado para 16 px (nítido a 16 y 32); los PNG, para quien no lee SVG. Los iconos de la
  // aplicación instalada van en el manifiesto. Todos salen de `bun run activos` (scripts/activos-marca.ts).
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon-16.png", type: "image/png", sizes: "16x16" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};

/** Imagen para compartir de Escenara (1200 × 630), pintada con Manrope. */
export const IMAGEN_SOCIAL_DE_ESCENARA = "/imagen-social.png";

/**
 * Metadatos de la página. Sin marca publicada, los de Escenara (con su imagen para compartir si hay URL pública). Con ella, su nombre, su lema y los iconos que se
 * generaron al publicarla (sin logotipos subidos, el icono de Escenara). Next escapa estos textos al escribir el HTML.
 */
export function metadatosDeLaMarca(marca: MarcaAplicada | null, base: URL | null = null): Metadata {
  if (!marca) {
    // La imagen para compartir necesita una URL absoluta de verdad: sin URL pública, los metadatos de siempre.
    if (!base) return METADATOS_DE_ESCENARA;
    return {
      ...METADATOS_DE_ESCENARA,
      metadataBase: base,
      openGraph: {
        title: "Escenara · Da vida a cada escena",
        description: "Estudio abierto de personajes y vídeo",
        images: [{ url: IMAGEN_SOCIAL_DE_ESCENARA, width: 1200, height: 630, alt: "Escenara · Da vida a cada escena" }],
      },
      twitter: { card: "summary_large_image" },
    };
  }
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
    // La imagen para compartir tiene que ser una URL absoluta de verdad: sin URL pública no se emite (Next pondría
    // `http://localhost`, que ningún lector de enlaces puede abrir).
    ...(base ? { metadataBase: base } : {}),
    openGraph: {
      title: marca.nombre,
      description: marca.descripcion,
      ...(social && base ? { images: [social] } : {}),
    },
  };
}

const LOCALES = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/**
 * URL pública de la instalación para las URL absolutas de los metadatos: la de Admin › Ajustes › URL pública y, si está
 * vacía, la de `BETTER_AUTH_URL`. Una dirección local no vale (no se puede abrir desde fuera): entonces `null`.
 */
export function baseDeLaInstalacion(urlPublica: string, urlDeAcceso: string | undefined): URL | null {
  for (const candidata of [urlPublica.trim(), urlDeAcceso?.trim() ?? ""]) {
    if (candidata === "") continue;
    try {
      const url = new URL(candidata);
      if ((url.protocol === "https:" || url.protocol === "http:") && !LOCALES.has(url.hostname)) {
        return new URL(url.origin);
      }
    } catch {
      // Una URL mal escrita no sirve de base; se prueba la siguiente.
    }
  }
  return null;
}
