import type { Image, Link, Paragraph } from "mdast";

/**
 * Vídeos de YouTube en las guías. En el Markdown se escriben como una miniatura enlazada, sola en su párrafo:
 *
 *     [![Título del vídeo](../assets/video/youtube-<id>.webp)](https://youtu.be/<id>)
 *
 * GitHub la muestra como imagen que lleva al vídeo. La web la convierte en una fachada ligera: la miniatura
 * (local, sin pedir nada a terceros) y un botón; el reproductor de youtube-nocookie.com solo se carga al pulsar.
 * Este módulo no usa APIs de Node: también lo importa el script del navegador.
 */

/** Los identificadores de YouTube son 11 caracteres de base64 para URL. */
export const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/;

const DOMINIOS_YOUTUBE = new Set([
  "youtu.be",
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

function urlDe(texto: string): URL | null {
  try {
    return new URL(texto);
  } catch {
    return null;
  }
}

/** ¿Apunta el enlace a YouTube? (aunque el identificador no sea válido). */
export function esEnlaceDeYoutube(url: string): boolean {
  const u = urlDe(url);
  return u !== null && (u.protocol === "https:" || u.protocol === "http:") && DOMINIOS_YOUTUBE.has(u.hostname);
}

/** Identificador del vídeo de un enlace de YouTube; `null` si el enlace no es de YouTube o el id no es válido. */
export function idDeYoutube(url: string): string | null {
  if (!esEnlaceDeYoutube(url)) return null;
  const u = urlDe(url) as URL;
  const partes = u.pathname.split("/").filter(Boolean);
  let id: string | null | undefined;
  if (u.hostname === "youtu.be") id = partes.length === 1 ? partes[0] : null;
  else if (partes[0] === "watch" && partes.length === 1) id = u.searchParams.get("v");
  else if ((partes[0] === "embed" || partes[0] === "shorts") && partes.length === 2) id = partes[1];
  return id && ID_YOUTUBE.test(id) ? id : null;
}

/** Dirección del reproductor sin cookies. `autoplay` solo tras el clic de quien lee. */
export function urlDeInsercion(id: string, opciones: { autoplay?: boolean } = {}): string {
  if (!ID_YOUTUBE.test(id)) throw new Error(`Identificador de YouTube no válido: ${id}`);
  const url = new URL(`https://www.youtube-nocookie.com/embed/${id}`);
  url.searchParams.set("rel", "0");
  if (opciones.autoplay) url.searchParams.set("autoplay", "1");
  return url.toString();
}

/** Página del vídeo en YouTube: destino del enlace cuando no hay JavaScript. */
export function urlDeVideo(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * Si el párrafo es solo una miniatura enlazada a YouTube, devuelve su enlace y su imagen; si no, `null`.
 * Un enlace de YouTube con una imagen dentro **es** un vídeo: quien lo valida decide si el id es correcto.
 */
export function miniaturaEnlazada(parrafo: Paragraph): { enlace: Link; imagen: Image } | null {
  const hijos = parrafo.children.filter((h) => !(h.type === "text" && h.value.trim() === ""));
  const enlace = hijos[0];
  if (hijos.length !== 1 || enlace?.type !== "link" || !esEnlaceDeYoutube(enlace.url)) return null;
  const dentro = enlace.children.filter((h) => !(h.type === "text" && h.value.trim() === ""));
  const imagen = dentro[0];
  if (dentro.length !== 1 || imagen?.type !== "image") return null;
  return { enlace, imagen };
}

/**
 * Árbol de la fachada (`<figure>` con el enlace, la miniatura, el botón y el pie). Se queda en mdast con
 * `data.hName` para que Astro siga optimizando la miniatura como cualquier otra imagen de una guía.
 */
export function fachadaDeVideo(id: string, imagen: Image): Paragraph {
  const titulo = (imagen.alt ?? "").trim();
  return {
    type: "paragraph",
    data: { hName: "figure", hProperties: { className: ["video-youtube"], dataVideoId: id, dataTitulo: titulo } },
    children: [
      {
        type: "link",
        url: urlDeVideo(id),
        data: {
          hProperties: {
            className: ["video-youtube__fachada"],
            ariaLabel: `Reproducir el vídeo «${titulo}» (se carga desde YouTube)`,
          },
        },
        children: [
          { ...imagen, alt: titulo, title: null },
          {
            type: "text",
            value: "",
            data: { hName: "span", hProperties: { className: ["video-youtube__boton"], ariaHidden: "true" } },
          },
        ],
      },
      { type: "emphasis", data: { hName: "figcaption" }, children: [{ type: "text", value: titulo }] },
    ],
  };
}
