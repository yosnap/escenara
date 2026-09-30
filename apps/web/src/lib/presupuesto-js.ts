/**
 * **Presupuesto de JavaScript por ruta**: cuánto JavaScript comprimido descarga el navegador en la primera carga de
 * cada página y si cabe en su tope.
 *
 * Next 16 (webpack) ya no imprime el «First Load JS», así que se calcula del propio build:
 * - `build-manifest.json` da los ficheros comunes a todas las páginas (`rootMainFiles`);
 * - cada `page_client-reference-manifest.js` da, para los componentes de cliente de esa ruta (sus layouts y la
 *   página), los trozos que el navegador tiene que cargar. Los componentes de otras rutas figuran con la lista vacía.
 *
 * La suma de ambos, comprimida con gzip, es el JavaScript de la ruta. Los polyfills (`nomodule`) no cuentan: los
 * navegadores actuales no los descargan.
 */

/** Meta del proyecto para cualquier ruta: 200 KB de JavaScript comprimido. */
export const META_KB = 200;

export interface Presupuestos {
  /** Tope por defecto en KB comprimidos para las rutas sin tope propio. */
  porDefectoKb: number;
  /** Topes propios de las rutas que hoy superan la meta: deuda anotada, con el tamaño real medido al fijarlos. */
  rutas: Record<string, { topeKb: number; motivo: string }>;
}

export interface MedidaRuta {
  ruta: string;
  /** Ficheros `static/chunks/...` que carga la ruta (comunes incluidos). */
  ficheros: string[];
  kb: number;
}

export interface ResultadoRuta extends MedidaRuta {
  topeKb: number;
  pasa: boolean;
  /** La ruta tiene un tope propio por encima de la meta (deuda). */
  deuda: boolean;
}

const MANIFIESTO = /__RSC_MANIFEST\["([^"]+)"\]\s*=\s*(\{[\s\S]*\})\s*;?\s*$/;

interface ManifiestoCliente {
  clientModules: Record<string, { chunks: (string | number)[] }>;
}

/** Lee un `page_client-reference-manifest.js` sin ejecutarlo: devuelve la clave de la página y su JSON. */
export function leerManifiestoCliente(fuente: string): { clave: string; manifiesto: ManifiestoCliente } {
  const m = MANIFIESTO.exec(fuente);
  if (!m?.[1] || !m[2]) throw new Error("El manifiesto de cliente no tiene el formato esperado de Next.");
  const manifiesto = JSON.parse(m[2]) as ManifiestoCliente;
  if (typeof manifiesto.clientModules !== "object" || manifiesto.clientModules === null) {
    throw new Error(`El manifiesto de «${m[1]}» no trae clientModules.`);
  }
  return { clave: m[1], manifiesto };
}

/** «/(cuenta)/entrar/page» → «/entrar»; «/page» → «/». Los grupos entre paréntesis no forman parte de la URL. */
export function rutaDeClave(clave: string): string {
  const partes = clave
    .replace(/\/page$/, "")
    .split("/")
    .filter((p) => p && !/^\(.+\)$/.test(p));
  return `/${partes.join("/")}`;
}

/** Parte estable de la ruta de un módulo: desde la app («src/…») o desde el paquete («next/dist/…»). */
const colaDelModulo = (clave: string): string => {
  const sinConsulta = clave.split("?")[0] ?? clave;
  for (const marca of ["/node_modules/", "/apps/web/"]) {
    const i = sinConsulta.lastIndexOf(marca);
    if (i >= 0) return sinConsulta.slice(i + marca.length);
  }
  return sinConsulta;
};

/**
 * Componentes de cliente que la ruta usa de verdad: los que su código de servidor (el `page.js` y los trozos de
 * servidor que carga) referencia. El manifiesto de cada ruta lista también módulos de otras rutas con sus trozos, así
 * que sin este filtro cada página sumaría el JavaScript de las demás.
 */
export function entradasDeCliente(manifiesto: ManifiestoCliente, fuentesServidor: readonly string[]): string[] {
  return Object.keys(manifiesto.clientModules).filter((clave) => {
    const cola = colaDelModulo(clave);
    return cola.length > 0 && fuentesServidor.some((f) => f.includes(cola));
  });
}

/** Ficheros JavaScript de la ruta: los comunes más los trozos de sus componentes de cliente, sin repetir. */
export function ficherosDeRuta(
  comunes: readonly string[],
  manifiesto: ManifiestoCliente,
  entradas: readonly string[],
): string[] {
  const ficheros = new Set(comunes.filter((f) => f.endsWith(".js")));
  for (const clave of entradas) {
    const modulo = manifiesto.clientModules[clave];
    if (!modulo) continue;
    // Next escribe las rutas dinámicas codificadas («%5Bid%5D»); en disco la carpeta es «[id]».
    for (const trozo of modulo.chunks) {
      if (typeof trozo === "string" && trozo.endsWith(".js")) ficheros.add(decodeURIComponent(trozo));
    }
  }
  return [...ficheros].sort();
}

/** KB comprimidos de una lista de ficheros, con el tamaño de cada uno ya medido. */
export function sumarKb(ficheros: readonly string[], bytesGzip: (fichero: string) => number): number {
  const total = ficheros.reduce((suma, f) => suma + bytesGzip(f), 0);
  return Math.round((total / 1024) * 10) / 10;
}

export function comprobarPresupuestos(medidas: readonly MedidaRuta[], presupuestos: Presupuestos): ResultadoRuta[] {
  if (!(presupuestos.porDefectoKb > 0)) throw new Error("El tope por defecto tiene que ser un número positivo.");
  for (const [ruta, p] of Object.entries(presupuestos.rutas)) {
    if (!(p.topeKb > 0) || !p.motivo.trim()) throw new Error(`El tope de «${ruta}» necesita un número y un motivo.`);
  }
  return medidas
    .map((m) => {
      const propio = presupuestos.rutas[m.ruta];
      const topeKb = propio?.topeKb ?? presupuestos.porDefectoKb;
      return { ...m, topeKb, pasa: m.kb <= topeKb, deuda: propio !== undefined && topeKb > META_KB };
    })
    .sort((a, b) => b.kb - a.kb);
}

/** Topes propios que ya no corresponden a ninguna ruta del build: se avisan para no dejar deuda fantasma. */
export function topesSinRuta(medidas: readonly MedidaRuta[], presupuestos: Presupuestos): string[] {
  const rutas = new Set(medidas.map((m) => m.ruta));
  return Object.keys(presupuestos.rutas).filter((r) => !rutas.has(r));
}

/** Tabla en texto para la consola del build y el informe. */
export function tablaPresupuestos(resultados: readonly ResultadoRuta[]): string {
  const ancho = Math.max(5, ...resultados.map((r) => r.ruta.length));
  const filas = resultados.map(
    (r) =>
      `${r.pasa ? "  " : "✗ "}${r.ruta.padEnd(ancho)}  ${r.kb.toFixed(1).padStart(7)} KB  / ${String(r.topeKb).padStart(4)} KB${r.deuda ? "  (deuda: meta 200 KB)" : ""}`,
  );
  return [`  ${"Ruta".padEnd(ancho)}  JS gzip       Tope`, ...filas].join("\n");
}
