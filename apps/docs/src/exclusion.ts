import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

/** Algo que no debe salir en la web: una ruta privada o un texto con pinta de clave. */
export interface Fuga {
  archivo: string;
  motivo: string;
}

/** Nombres de carpeta o de archivo que nunca se publican. */
const RUTAS_PROHIBIDAS: [RegExp, string][] = [
  [/(^|\/)privado(\/|$)/, "carpeta docs/privado"],
  [/(^|\/)plans(\/|$)/, "carpeta plans"],
  [/(^|\/)datos-privados(\/|$)/, "carpeta datos-privados"],
  [/(^|\/)\.env/, "fichero .env"],
  [/claves-api\.local/, "documento privado de claves"],
];

/** Menciones dentro del contenido publicado que delatan material privado. */
const TEXTOS_PROHIBIDOS: [RegExp, string][] = [
  [/docs\/privado\//, "ruta docs/privado/"],
  [/datos-privados\//, "ruta datos-privados/"],
  [/claves-api\.local/, "documento privado de claves"],
  [/escenara-planes/, "repositorio privado de planes"],
  [/(?:^|[^\w-])plans\//, "ruta plans/"],
  [/\/Users\/[A-Za-z0-9._-]+\//, "ruta de un directorio personal"],
  [/\/Volumes\/[A-Za-z0-9._ -]+\//, "ruta de un volumen local"],
];

/** Formas conocidas de claves y secretos. Se buscan en todo lo publicado. */
const CLAVES: [RegExp, string][] = [
  [/\bsk-[A-Za-z0-9_-]{20,}/, "clave con prefijo sk-"],
  [/\bsk_[A-Za-z0-9]{20,}/, "clave con prefijo sk_"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "clave de Google"],
  [/\bAKIA[0-9A-Z]{16}\b/, "clave de acceso de AWS"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "token de GitHub"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "token de Slack"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "clave privada"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]{20,}/, "cabecera Bearer con valor"],
  [
    /\b(?:[A-Z][A-Z0-9_]*(?:_KEY|_SECRET|_TOKEN|_PASSWORD)|ESCENARA_CLAVE_MAESTRA)\s*[=:]\s*["']?[A-Za-z0-9+/_.-]{12,}/,
    "variable secreta con valor",
  ],
];

const TEXTO = new Set([".html", ".js", ".mjs", ".css", ".json", ".xml", ".txt", ".svg", ".md", ".map", ".webmanifest"]);

function listar(dir: string): { archivos: string[]; enlaces: string[] } {
  const entradas = readdirSync(dir, { withFileTypes: true, recursive: true });
  return {
    archivos: entradas.filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name)),
    // Un enlace simbólico en lo publicado puede apuntar a cualquier sitio: nunca es legítimo.
    enlaces: entradas.filter((e) => e.isSymbolicLink()).map((e) => path.join(e.parentPath, e.name)),
  };
}

/** Lee el texto de un archivo publicado; los fragmentos del buscador van comprimidos con gzip. */
function textoDe(archivo: string): string | null {
  const ext = path.extname(archivo);
  if (TEXTO.has(ext)) return readFileSync(archivo, "utf8");
  if (ext === ".pf_fragment" || ext === ".pf_index" || ext === ".pf_meta") {
    const crudo = readFileSync(archivo);
    try {
      return gunzipSync(crudo).toString("utf8");
    } catch {
      // Si no se puede descomprimir, se revisa tal cual: saltárselo dejaría un hueco en la comprobación.
      return crudo.toString("utf8");
    }
  }
  return null;
}

/** Revisa un texto suelto: sirve para el build y para comprobar las guías antes de publicarlas. */
export function fugasEnTexto(texto: string, archivo: string): Fuga[] {
  const fugas: Fuga[] = [];
  for (const [patron, motivo] of [...TEXTOS_PROHIBIDOS, ...CLAVES]) {
    if (patron.test(texto)) fugas.push({ archivo, motivo });
  }
  return fugas;
}

/** Recorre la carpeta del build y devuelve todo lo que no debería estar publicado. */
export function buscarFugas(dirPublicado: string): Fuga[] {
  const fugas: Fuga[] = [];
  const { archivos, enlaces } = listar(dirPublicado);
  for (const enlace of enlaces) {
    fugas.push({ archivo: path.relative(dirPublicado, enlace).split(path.sep).join("/"), motivo: "enlace simbólico" });
  }
  for (const archivo of archivos) {
    const relativo = path.relative(dirPublicado, archivo).split(path.sep).join("/");
    for (const [patron, motivo] of RUTAS_PROHIBIDAS) {
      if (patron.test(relativo)) fugas.push({ archivo: relativo, motivo });
    }
    const texto = textoDe(archivo);
    if (texto !== null) fugas.push(...fugasEnTexto(texto, relativo));
  }
  return fugas;
}
