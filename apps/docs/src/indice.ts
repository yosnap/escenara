import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Raíz del repositorio: la web lee las guías de `docs/` en el build, sin copiarlas. Se busca subiendo desde este
 * módulo (y, si no, desde el directorio de trabajo) porque en el build se ejecuta ya empaquetado dentro de `dist/`.
 */
function buscarRaiz(): string {
  for (const inicio of [path.dirname(fileURLToPath(import.meta.url)), process.cwd()]) {
    let dir = inicio;
    while (true) {
      if (existsSync(path.join(dir, "docs", "guias", "indice.json"))) return dir;
      const padre = path.dirname(dir);
      if (padre === dir) break;
      dir = padre;
    }
  }
  throw new Error(
    "No se encuentra docs/guias/indice.json: la web de documentación se construye dentro del repositorio.",
  );
}

export const RAIZ_REPO = buscarRaiz();
export const DIR_DOCS = path.join(RAIZ_REPO, "docs");
export const DIR_GUIAS = path.join(DIR_DOCS, "guias");
export const DIR_DIAGRAMAS = path.join(DIR_DOCS, "assets", "diagramas");
export const FICHERO_INDICE = path.join(DIR_GUIAS, "indice.json");

/** Prefijo de ruta de las guías en la web: `/guias/<slug>/`. */
export const PREFIJO_GUIAS = "guias";

export interface Guia {
  archivo: string;
  slug: string;
  titulo: string;
  descripcion: string;
}

export interface Seccion {
  titulo: string;
  guias: Guia[];
}

/** Solo nombres planos de `docs/guias`: sin barras ni `..`, así el índice no puede publicar nada de fuera. */
const ARCHIVO_VALIDO = /^[a-z0-9][a-z0-9.-]*\.md$/;

function texto(valor: unknown, donde: string): string {
  if (typeof valor !== "string" || valor.trim() === "") {
    throw new Error(`Índice de guías: falta un texto en ${donde}.`);
  }
  return valor.trim();
}

/** Valida el índice crudo. Cualquier error para el build con un mensaje que dice dónde está. */
export function validarIndice(crudo: unknown, dirGuias: string = DIR_GUIAS): Seccion[] {
  const secciones = (crudo as { secciones?: unknown } | null)?.secciones;
  if (!Array.isArray(secciones) || secciones.length === 0) {
    throw new Error("Índice de guías: «secciones» debe ser una lista con al menos una sección.");
  }
  const vistos = new Set<string>();
  return secciones.map((seccion: { titulo?: unknown; guias?: unknown }, i) => {
    const titulo = texto(seccion?.titulo, `la sección ${i + 1}`);
    if (!Array.isArray(seccion.guias) || seccion.guias.length === 0) {
      throw new Error(`Índice de guías: la sección «${titulo}» no tiene guías.`);
    }
    const guias = seccion.guias.map((g: Record<string, unknown>, j: number): Guia => {
      const donde = `«${titulo}», guía ${j + 1}`;
      const archivo = texto(g?.archivo, donde);
      if (!ARCHIVO_VALIDO.test(archivo)) {
        throw new Error(`Índice de guías: «${archivo}» no es un nombre de guía válido (${donde}).`);
      }
      if (vistos.has(archivo)) throw new Error(`Índice de guías: «${archivo}» aparece dos veces.`);
      vistos.add(archivo);
      if (!existsSync(path.join(dirGuias, archivo))) {
        throw new Error(`Índice de guías: no existe docs/guias/${archivo} (${donde}).`);
      }
      return {
        archivo,
        slug: archivo.replace(/\.md$/, ""),
        titulo: texto(g.titulo, donde),
        descripcion: texto(g.descripcion, donde),
      };
    });
    return { titulo, guias };
  });
}

export function cargarIndice(fichero: string = FICHERO_INDICE): Seccion[] {
  let crudo: unknown;
  try {
    crudo = JSON.parse(readFileSync(fichero, "utf8"));
  } catch (error) {
    throw new Error(`Índice de guías: no se puede leer ${fichero}: ${(error as Error).message}`);
  }
  return validarIndice(crudo, path.dirname(fichero));
}

export function guiasDe(secciones: Seccion[]): Guia[] {
  return secciones.flatMap((s) => s.guias);
}

/** Identificador de la entrada en la colección de Starlight (y ruta de la página). */
export function idDeGuia(slug: string): string {
  return `${PREFIJO_GUIAS}/${slug}`;
}
