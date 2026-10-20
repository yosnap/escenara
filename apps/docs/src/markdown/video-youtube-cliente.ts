import { ID_YOUTUBE, urlDeInsercion } from "./video-youtube";

const FACHADA = "a.video-youtube__fachada";

/** Permisos del reproductor de YouTube: los que pide su propio código de inserción. */
const PERMISOS = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";

/**
 * Sustituye la fachada por el reproductor de youtube-nocookie.com y le pasa el foco. Devuelve `false` si la figura
 * no trae un id válido: entonces el enlace sigue su curso normal hacia YouTube.
 */
export function reproducir(fachada: HTMLAnchorElement): boolean {
  const figura = fachada.closest<HTMLElement>("figure.video-youtube");
  const id = figura?.dataset.videoId ?? "";
  if (!figura || !ID_YOUTUBE.test(id)) return false;
  const marco = fachada.ownerDocument.createElement("iframe");
  marco.className = "video-youtube__marco";
  marco.src = urlDeInsercion(id, { autoplay: true });
  marco.title = `Vídeo de YouTube: ${figura.dataset.titulo || "tutorial de Escenara"}`;
  marco.loading = "lazy";
  marco.allow = PERMISOS;
  marco.allowFullscreen = true;
  marco.referrerPolicy = "strict-origin-when-cross-origin";
  fachada.replaceWith(marco);
  marco.focus();
  return true;
}

function fachadaDe(destino: EventTarget | null): HTMLAnchorElement | null {
  const fachada = destino instanceof Element ? destino.closest(FACHADA) : null;
  return fachada instanceof HTMLAnchorElement ? fachada : null;
}

/**
 * Con JavaScript la fachada se comporta como un botón: clic o Intro (lo da el enlace) y Espacio reproducen en la
 * página. Sin JavaScript, o con Ctrl/Cmd/Mayús (abrir en otra pestaña), sigue siendo un enlace al vídeo.
 */
export function activarFachadasDeVideo(raiz: Document): void {
  for (const fachada of raiz.querySelectorAll(FACHADA)) fachada.setAttribute("role", "button");
  raiz.addEventListener("click", (evento) => {
    if (evento.defaultPrevented || evento.button !== 0) return;
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    const fachada = fachadaDe(evento.target);
    if (fachada && reproducir(fachada)) evento.preventDefault();
  });
  raiz.addEventListener("keydown", (evento) => {
    if (evento.key !== " " || evento.defaultPrevented) return;
    const fachada = fachadaDe(evento.target);
    if (fachada && reproducir(fachada)) evento.preventDefault();
  });
}
