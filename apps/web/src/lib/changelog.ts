/** Lectura estructurada de `docs/CHANGELOG.md` (formato Keep a Changelog en español). */

export interface SeccionCambios {
  titulo: string;
  entradas: string[];
}

export interface VersionPublicada {
  version: string;
  /** Fecha ISO (AAAA-MM-DD) o `null` si la versión aún no se ha publicado. */
  fecha: string | null;
  secciones: SeccionCambios[];
}

const CABECERA_VERSION = /^## \[([^\]]+)\](?:\s*·\s*(\d{4}-\d{2}-\d{2}))?/;

/** Convierte el Markdown del changelog en versiones, de la más reciente a la más antigua. */
export function analizarChangelog(markdown: string): VersionPublicada[] {
  const versiones: VersionPublicada[] = [];
  let version: VersionPublicada | null = null;
  let seccion: SeccionCambios | null = null;

  for (const linea of markdown.split("\n")) {
    const cabecera = linea.match(CABECERA_VERSION);
    if (cabecera?.[1]) {
      version = { version: cabecera[1], fecha: cabecera[2] ?? null, secciones: [] };
      versiones.push(version);
      seccion = null;
      continue;
    }
    if (!version) continue;
    if (linea.startsWith("### ")) {
      seccion = { titulo: linea.slice(4).trim(), entradas: [] };
      version.secciones.push(seccion);
    } else if (linea.startsWith("- ") && seccion) {
      seccion.entradas.push(linea.slice(2).trim());
    } else if (/^\s{2,}\S/.test(linea) && seccion?.entradas.length) {
      // Continuación de una entrada partida en varias líneas.
      const i = seccion.entradas.length - 1;
      seccion.entradas[i] = `${seccion.entradas[i]} ${linea.trim()}`;
    }
  }
  return versiones;
}

export type FragmentoTexto = { tipo: "texto" | "codigo" | "negrita"; valor: string };

/** Divide una entrada en texto, `código` y **negrita** para pintarla sin interpretar HTML. */
export function fragmentosEnLinea(texto: string): FragmentoTexto[] {
  const fragmentos: FragmentoTexto[] = [];
  const patron = /(`[^`]+`|\*\*[^*]+\*\*)/g;
  let desde = 0;
  for (const coincidencia of texto.matchAll(patron)) {
    const i = coincidencia.index ?? 0;
    if (i > desde) fragmentos.push({ tipo: "texto", valor: texto.slice(desde, i) });
    const marca = coincidencia[0];
    fragmentos.push(
      marca.startsWith("`")
        ? { tipo: "codigo", valor: marca.slice(1, -1) }
        : { tipo: "negrita", valor: marca.slice(2, -2) },
    );
    desde = i + marca.length;
  }
  if (desde < texto.length) fragmentos.push({ tipo: "texto", valor: texto.slice(desde) });
  return fragmentos;
}
