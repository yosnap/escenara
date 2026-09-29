import { existsSync, readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import type { Html, Image, Parent, PhrasingContent, Root, RootContent } from "mdast";
import type { VFile } from "vfile";
import { DIR_DIAGRAMAS, DIR_DOCS, DIR_GUIAS, idDeGuia } from "../indice";

/** Los archivos de `docs/assets` que una guía enlaza (no incrusta) se publican bajo esta ruta. */
export const DIR_ASSETS = path.join(DIR_DOCS, "assets");
export const RUTA_MEDIOS = "/medios";

const EXTERNA = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;

function dentroDe(dir: string, ruta: string): boolean {
  const relativa = path.relative(dir, ruta);
  return relativa !== "" && !relativa.startsWith("..") && !path.isAbsolute(relativa);
}

/**
 * Traduce un enlace de una guía a su dirección en la web. Devuelve `null` cuando el destino no se
 * publica (otra carpeta de `docs/`, una ruta de la aplicación como `/proyectos/…`): el enlace se
 * convierte en texto para que la web no tenga enlaces rotos ni apunte a nada privado.
 */
export function destinoDeEnlace(url: string, dirOrigen: string, slugs: ReadonlySet<string>): string | null {
  if (EXTERNA.test(url)) return url;
  if (url.startsWith("/")) return null;
  const [ruta = "", ancla] = url.split("#", 2);
  const absoluta = path.resolve(dirOrigen, decodeURI(ruta));
  const sufijo = ancla ? `#${ancla}` : "";
  if (dentroDe(DIR_GUIAS, absoluta) && path.dirname(absoluta) === DIR_GUIAS && absoluta.endsWith(".md")) {
    const slug = path.basename(absoluta, ".md");
    return slugs.has(slug) ? `/${idDeGuia(slug)}/${sufijo}` : null;
  }
  return rutaDeMedio(absoluta);
}

/** Ruta pública de un archivo de `docs/assets` enlazado desde una guía; `null` para cualquier otra cosa. */
export function rutaDeMedio(absoluta: string): string | null {
  if (!dentroDe(DIR_ASSETS, absoluta) || absoluta.endsWith(".md")) return null;
  return `${RUTA_MEDIOS}/${path.relative(DIR_ASSETS, absoluta).split(path.sep).join("/")}`;
}

/**
 * Una imagen incrustada solo se publica si su ruta **real** (tras resolver enlaces simbólicos) está dentro de
 * `docs/assets`. Sin esto, `![](../../datos-privados/foto.png)` acabaría en `dist/_astro` con el build en verde.
 */
export function exigirImagenPublicable(url: string, dirOrigen: string, guia: string): void {
  if (EXTERNA.test(url) || url.startsWith("/")) return;
  const absoluta = path.resolve(dirOrigen, decodeURI(url.split("#", 1)[0] ?? ""));
  if (!existsSync(absoluta)) return; // Astro avisa de la imagen que falta.
  if (!dentroDe(realpathSync(DIR_ASSETS), realpathSync(absoluta))) {
    throw new Error(`${guia} incrusta ${url}, que no está en docs/assets: no se publica.`);
  }
}

/** Enlaces de un Markdown que no son imágenes: `[texto](destino)`, sin el `!` delante. */
const ENLACE = /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/**
 * Archivos de `docs/assets` que enlazan las guías publicadas (audio de ejemplo, capturas a tamaño completo).
 * Se calcula leyendo las guías, así solo sale en la web lo que alguna guía enlaza.
 */
export function mediosEnlazados(archivosDeGuias: string[]): { ruta: string; origen: string }[] {
  const medios = new Map<string, string>();
  for (const archivo of archivosDeGuias) {
    for (const [, url = ""] of readFileSync(archivo, "utf8").matchAll(ENLACE)) {
      if (EXTERNA.test(url) || url.startsWith("/")) continue;
      const absoluta = path.resolve(path.dirname(archivo), decodeURI(url.split("#", 1)[0] ?? ""));
      const ruta = rutaDeMedio(absoluta);
      if (!ruta) continue;
      if (!existsSync(absoluta)) throw new Error(`${path.basename(archivo)} enlaza ${url}, que no existe.`);
      medios.set(ruta, absoluta);
    }
  }
  return [...medios].map(([ruta, origen]) => ({ ruta, origen }));
}

/** Lee un diagrama SVG y lo deja listo para ir en línea: así hereda las variables CSS del tema activo. */
export function svgEnLinea(archivo: string): string {
  const svg = readFileSync(archivo, "utf8")
    .replace(/<\?xml[^>]*\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (!/^<svg[\s>]/.test(svg) || !/role="img"/.test(svg) || !/<title[\s>]/.test(svg)) {
    throw new Error(`El diagrama ${path.basename(archivo)} debe ser un <svg role="img"> con <title>.`);
  }
  return `<figure class="diagrama">${svg}</figure>`;
}

function diagramaDe(nodo: RootContent, dirOrigen: string, guia: string): Html | null {
  if (nodo.type !== "paragraph") return null;
  const hijos = nodo.children.filter((h) => !(h.type === "text" && h.value.trim() === ""));
  const imagen = hijos[0];
  if (hijos.length !== 1 || imagen?.type !== "image") return null;
  const absoluta = path.resolve(dirOrigen, decodeURI((imagen as Image).url));
  exigirImagenPublicable((imagen as Image).url, dirOrigen, guia);
  if (!dentroDe(DIR_DIAGRAMAS, absoluta) || !absoluta.endsWith(".svg")) return null;
  if (!imagen.alt?.trim()) throw new Error(`El diagrama ${path.basename(absoluta)} necesita texto alternativo.`);
  return { type: "html", value: svgEnLinea(absoluta) };
}

function recorrer(padre: Parent, dirOrigen: string, slugs: ReadonlySet<string>, guia: string): void {
  const nuevos: RootContent[] = [];
  for (const hijo of padre.children as RootContent[]) {
    const diagrama = diagramaDe(hijo, dirOrigen, guia);
    if (diagrama) {
      nuevos.push(diagrama);
      continue;
    }
    if (hijo.type === "link") {
      const destino = destinoDeEnlace(hijo.url, dirOrigen, slugs);
      if (destino === null) {
        recorrer(hijo, dirOrigen, slugs, guia);
        nuevos.push(...(hijo.children as PhrasingContent[]));
        continue;
      }
      hijo.url = destino;
    }
    if (hijo.type === "definition") {
      hijo.url = destinoDeEnlace(hijo.url, dirOrigen, slugs) ?? "#";
    }
    if (hijo.type === "image") exigirImagenPublicable(hijo.url, dirOrigen, guia);
    if ("children" in hijo) recorrer(hijo, dirOrigen, slugs, guia);
    nuevos.push(hijo);
  }
  padre.children = nuevos as Parent["children"];
}

/**
 * Adapta una guía de `docs/guias` a la web sin tocar el archivo: quita el título `#` (Starlight lo
 * pinta desde el índice), reescribe los enlaces y pone los diagramas en línea.
 */
export function remarkGuias(opciones: { slugs: Iterable<string> }) {
  const slugs = new Set(opciones.slugs);
  return (arbol: Root, archivo: VFile) => {
    const dirOrigen = archivo.path ? path.dirname(archivo.path) : DIR_GUIAS;
    // Las guías viven fuera de src/content: el validador de enlaces identifica cada página por su `slug`.
    const datos = archivo.data as { astro?: { frontmatter?: Record<string, unknown> } };
    if (archivo.path && dirOrigen === DIR_GUIAS && datos.astro?.frontmatter) {
      datos.astro.frontmatter.slug = idDeGuia(path.basename(archivo.path, ".md"));
    }
    const primero = arbol.children.findIndex((n) => n.type !== "html" && n.type !== "yaml");
    const titulo = arbol.children[primero];
    if (titulo?.type === "heading" && titulo.depth === 1) arbol.children.splice(primero, 1);
    recorrer(arbol, dirOrigen, slugs, archivo.path ? path.basename(archivo.path) : "una guía");
  };
}
