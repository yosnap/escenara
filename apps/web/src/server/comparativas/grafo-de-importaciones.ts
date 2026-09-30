import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Grafo de importaciones de un fichero del código, **transitivo** y solo dentro de `src/`: lo que un módulo puede
 * llegar a ejecutar. Lo usan los candados que garantizan por diseño que una pantalla no puede gastar dinero (no llega a
 * ningún adaptador de proveedor, ni a la cola, ni a la estimación que lee saldos).
 *
 * Cuenta las importaciones estáticas, las dinámicas con texto fijo (`import("…")`, `` import(`…`) ``), los `require("…")`
 * y las reexportaciones, en `.ts`, `.tsx`, `.js` y `.mjs`. Las de solo tipos no ejecutan nada y no cuentan. Los paquetes
 * de fuera de `src/` tampoco: ninguno de ellos habla con un proveedor de pago. Para una página, {@link alcanceDePagina}
 * añade los `layout` y `template` que Next ejecuta sin que nadie los importe.
 *
 * **Límite:** una importación con un nombre calculado (`import(variable)`, `require(variable)`) no se puede seguir. En
 * lugar de ignorarla, se apunta como `opaca:<fichero>` y cuenta como prohibida: el candado falla y alguien tiene que
 * mirarla. Tampoco ve lo que llegue por `eval` o por la red; para eso está el test que bloquea `fetch`. Es un candado
 * contra accidentes, no contra quien quiera saltárselo a propósito.
 */

const RAIZ = path.resolve(import.meta.dir, "../..");

const EXTENSIONES = ["", ".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx", "/index.js"];

function resolver(desde: string, origen: string): string | null {
  const base = origen.startsWith("@/")
    ? path.join(RAIZ, origen.slice(2))
    : origen.startsWith(".")
      ? path.resolve(path.dirname(desde), origen)
      : null;
  if (base === null) return null;
  for (const ext of EXTENSIONES) {
    const ruta = `${base}${ext}`;
    if (existsSync(ruta) && /\.(?:tsx?|m?js)$/.test(ruta)) return ruta;
  }
  return null;
}

/** Orígenes que un fichero importa y que se ejecutan (se quitan los `import type` y `export type`). */
export function importacionesDe(codigo: string): string[] {
  const salida: string[] = [];
  for (const m of codigo.matchAll(/\b(?:import|export)\s+(type\s+)?[^;]*?\s+from\s*["']([^"']+)["']/g)) {
    if (!m[1] && m[2]) salida.push(m[2]);
  }
  for (const m of codigo.matchAll(/\bimport\s*["']([^"']+)["']/g)) if (m[1]) salida.push(m[1]);
  for (const m of codigo.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) if (m[1]) salida.push(m[1]);
  for (const m of codigo.matchAll(/\bimport\(\s*`([^`$]+)`\s*\)/g)) if (m[1]) salida.push(m[1]);
  for (const m of codigo.matchAll(/\brequire\(\s*["'`]([^"'`$]+)["'`]\s*\)/g)) if (m[1]) salida.push(m[1]);
  return salida;
}

/** `true` si el código importa algo con un nombre que no se puede leer (`import(x)`, `require(x)`, plantillas con `${}`). */
export function tieneImportacionesOpacas(codigo: string): boolean {
  const literal = /^\s*(?:["'][^"']*["']|`[^`$]*`)\s*\)/;
  // Sin comentarios: un «import()» dentro de uno no ejecuta nada.
  const sinComentarios = codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  for (const m of sinComentarios.matchAll(/\b(?:import|require)\(/g)) {
    const resto = sinComentarios.slice((m.index ?? 0) + m[0].length);
    if (!literal.test(resto)) return true;
  }
  return false;
}

/** Todos los ficheros de `src/` a los que llegan los de `inicio`, con rutas relativas a `src/`. */
export function alcanceDe(...inicio: string[]): Set<string> {
  const visto = new Set<string>();
  const pendientes = inicio.map((f) => path.join(RAIZ, f));
  while (pendientes.length > 0) {
    const fichero = pendientes.pop() as string;
    const relativa = path.relative(RAIZ, fichero).split(path.sep).join("/");
    if (visto.has(relativa)) continue;
    visto.add(relativa);
    const codigo = readFileSync(fichero, "utf8");
    if (tieneImportacionesOpacas(codigo)) visto.add(`opaca:${relativa}`);
    for (const origen of importacionesDe(codigo)) {
      const destino = resolver(fichero, origen);
      if (destino) pendientes.push(destino);
    }
  }
  return visto;
}

/** Alcance de una página de `app/` con los `layout` y `template` de su carpeta y de las de encima. */
export function alcanceDePagina(pagina: string): Set<string> {
  const envoltorios: string[] = [];
  let carpeta = path.dirname(pagina);
  while (carpeta.startsWith("app")) {
    for (const nombre of ["layout.tsx", "template.tsx"]) {
      const ruta = path.join(carpeta, nombre);
      if (existsSync(path.join(RAIZ, ruta))) envoltorios.push(ruta);
    }
    const arriba = path.dirname(carpeta);
    if (arriba === carpeta) break;
    carpeta = arriba;
  }
  return alcanceDe(pagina, ...envoltorios);
}

/**
 * Módulos que gastan o pueden gastar dinero, o que hablan con un proveedor: los adaptadores y su registro, los
 * clientes de cada proveedor, la cola, el servicio de generación y la estimación (que consulta el saldo).
 */
export const PROHIBIDOS_SIN_COSTE: readonly RegExp[] = [
  /^opaca:/,
  /^server\/proveedores\/registro\.ts$/,
  /^server\/proveedores\/[^/]+\/(?:adaptador|cliente|canto)\.ts$/,
  /^server\/cola\//,
  /^server\/generacion\/(?:servicio|estimacion|seguimiento)\.ts$/,
  /^server\/produccion\/producir\.ts$/,
  /^server\/omni\//,
  /^server\/coherencia\/(?:jev|decidir|percepcion)\.ts$/,
];
