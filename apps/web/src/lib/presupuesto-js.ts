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

/** Meta del proyecto para cualquier ruta: 200 KB de JavaScript comprimido. Cambiarla es cambiar el ADR-0039. */
export const META_KB = 200;

/**
 * Margen de un tope propio sobre lo medido al fijarlo, en KB. Pequeño a propósito: una regresión de más de 3 KB en una
 * ruta con deuda rompe el build, y si es justificada se mide otra vez y se cambia el tope con su motivo.
 */
export const MARGEN_KB = 3;

/** Diferencia a partir de la cual el «Medido: X KB» de un motivo ya no es la medida real y se avisa para actualizarlo. */
export const DESFASE_AVISO_KB = 1;

export interface Presupuestos {
  /** Tope por defecto: siempre la meta (`META_KB`). */
  porDefectoKb: number;
  /**
   * Rutas **dadas de alta** que caben en la meta. Toda ruta del build tiene que estar aquí o en `rutas`: una pantalla
   * nueva sin alta hace fallar el build, para que su peso se mire al crearla y no cuando ya pesa.
   */
  dentroDeLaMeta: string[];
  /** Topes propios de las rutas que hoy superan la meta: deuda, con el tamaño medido al fijarlos y el motivo. */
  rutas: Record<string, { topeKb: number; motivo: string }>;
}

/** El «Medido: 237.8 KB.» que acompaña a cada tope propio, o `null` si el motivo no lo trae. */
export function medidoDelMotivo(motivo: string): number | null {
  const m = /Medido: (\d+(?:[.,]\d+)?) KB\.?\s*$/.exec(motivo.trim());
  return m?.[1] ? Number(m[1].replace(",", ".")) : null;
}

/**
 * Lee el fichero de topes (entrada de fuera del código) y cierra las trampas fáciles: la meta no se sube desde el
 * JSON, cada tope propio lleva su motivo con el «Medido: X KB.» y no pasa de lo medido más `MARGEN_KB`, y una ruta no
 * puede estar a la vez dentro de la meta y con tope propio.
 */
export function validarPresupuestos(valor: unknown): Presupuestos {
  const esObjeto = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  if (
    !esObjeto(valor) ||
    typeof valor.porDefectoKb !== "number" ||
    !esObjeto(valor.rutas) ||
    !Array.isArray(valor.dentroDeLaMeta)
  ) {
    throw new Error(
      "presupuesto-js.json tiene que tener «porDefectoKb» (número), «dentroDeLaMeta» (lista de rutas) y «rutas» (objeto).",
    );
  }
  if (valor.porDefectoKb !== META_KB) {
    throw new Error(
      `«porDefectoKb» tiene que ser ${META_KB}, la meta del ADR-0039. Para una ruta que no cabe, dale un tope propio con su motivo.`,
    );
  }
  const dentroDeLaMeta: string[] = [];
  for (const ruta of valor.dentroDeLaMeta) {
    if (typeof ruta !== "string" || !ruta.startsWith("/")) throw new Error(`«${String(ruta)}» no es una ruta («/…»).`);
    dentroDeLaMeta.push(ruta);
  }
  const rutas: Presupuestos["rutas"] = {};
  for (const [ruta, tope] of Object.entries(valor.rutas)) {
    if (
      !ruta.startsWith("/") ||
      !esObjeto(tope) ||
      typeof tope.topeKb !== "number" ||
      typeof tope.motivo !== "string"
    ) {
      throw new Error(
        `El tope de «${ruta}» tiene que ser { topeKb: número, motivo: texto } y la ruta empezar por «/».`,
      );
    }
    const medido = medidoDelMotivo(tope.motivo);
    if (medido === null) throw new Error(`El motivo del tope de «${ruta}» tiene que acabar en «Medido: X KB.».`);
    if (tope.topeKb > Math.ceil(medido + MARGEN_KB)) {
      throw new Error(
        `El tope de «${ruta}» (${tope.topeKb} KB) pasa de lo medido (${medido} KB) más ${MARGEN_KB} KB de margen.`,
      );
    }
    if (dentroDeLaMeta.includes(ruta)) throw new Error(`«${ruta}» está dentro de la meta y a la vez con tope propio.`);
    rutas[ruta] = { topeKb: tope.topeKb, motivo: tope.motivo };
  }
  const presupuestos = { porDefectoKb: valor.porDefectoKb, dentroDeLaMeta, rutas };
  comprobarPresupuestos([], presupuestos);
  return presupuestos;
}

/** Instrucciones para dar de alta una ruta nueva, que salen en el error del build. */
export const instruccionesDeAlta = (ruta: string, kb: number): string =>
  kb <= META_KB
    ? `Añade «${ruta}» a «dentroDeLaMeta» de apps/web/presupuesto-js.json (${kb} KB, cabe en ${META_KB}).`
    : `«${ruta}» pesa ${kb} KB y la meta es ${META_KB}: reduce su JavaScript (carga diferida, componentes de servidor) o, si está justificado, añádela a «rutas» con { "topeKb": ${Math.ceil(kb + MARGEN_KB)}, "motivo": "Por qué pesa. Medido: ${kb} KB." }. Un tope nuevo es deuda y exige su justificación en el JSON.`;

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
  /** La ruta no está dada de alta en el fichero de topes (pantalla nueva). */
  sinAlta: boolean;
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
  const dadas = new Set(presupuestos.dentroDeLaMeta);
  return medidas
    .map((m) => {
      const propio = presupuestos.rutas[m.ruta];
      const topeKb = propio?.topeKb ?? presupuestos.porDefectoKb;
      const sinAlta = !propio && !dadas.has(m.ruta);
      return {
        ...m,
        topeKb,
        pasa: !sinAlta && m.kb <= topeKb,
        deuda: propio !== undefined && topeKb > META_KB,
        sinAlta,
      };
    })
    .sort((a, b) => b.kb - a.kb);
}

/** Rutas del fichero de topes que ya no están en el build: se avisan para no dejar deuda fantasma. */
export function topesSinRuta(medidas: readonly MedidaRuta[], presupuestos: Presupuestos): string[] {
  const rutas = new Set(medidas.map((m) => m.ruta));
  return [...Object.keys(presupuestos.rutas), ...presupuestos.dentroDeLaMeta].filter((r) => !rutas.has(r));
}

/** Motivos cuyo «Medido: X KB» ya no es lo que pesa la ruta: el tope sigue valiendo, pero el dato está desfasado. */
export function medidasDesfasadas(medidas: readonly MedidaRuta[], presupuestos: Presupuestos): string[] {
  return medidas.flatMap((m) => {
    const propio = presupuestos.rutas[m.ruta];
    const medido = propio ? medidoDelMotivo(propio.motivo) : null;
    if (medido === null || Math.abs(medido - m.kb) <= DESFASE_AVISO_KB) return [];
    return [
      `«${m.ruta}»: el motivo dice ${medido} KB y hoy pesa ${m.kb} KB. Actualiza «Medido» (y el tope, si ha bajado).`,
    ];
  });
}

/** Tabla en texto para la consola del build y el informe. */
export function tablaPresupuestos(resultados: readonly ResultadoRuta[]): string {
  const ancho = Math.max(5, ...resultados.map((r) => r.ruta.length));
  const filas = resultados.map(
    (r) =>
      `${r.pasa ? "  " : "✗ "}${r.ruta.padEnd(ancho)}  ${r.kb.toFixed(1).padStart(7)} KB  / ${String(r.topeKb).padStart(4)} KB${r.deuda ? `  (deuda: meta ${META_KB} KB)` : ""}${r.sinAlta ? "  (sin dar de alta)" : ""}`,
  );
  return [`  ${"Ruta".padEnd(ancho)}  JS gzip       Tope`, ...filas].join("\n");
}
