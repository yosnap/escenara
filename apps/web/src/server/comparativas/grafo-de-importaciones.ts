import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Grafo de importaciones de un fichero del código, **transitivo** y solo dentro de `src/`: lo que un módulo puede
 * llegar a ejecutar. Lo usan los candados que garantizan por diseño que una pantalla no puede gastar dinero (no llega a
 * ningún adaptador de proveedor, ni a la cola, ni a la estimación que lee saldos).
 *
 * Cuenta las importaciones estáticas y las dinámicas, y las reexportaciones. Las de solo tipos no ejecutan nada y no
 * cuentan. Los paquetes de fuera de `src/` tampoco: ninguno de ellos habla con un proveedor de pago.
 */

const RAIZ = path.resolve(import.meta.dir, "../..");

const EXTENSIONES = ["", ".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolver(desde: string, origen: string): string | null {
  const base = origen.startsWith("@/")
    ? path.join(RAIZ, origen.slice(2))
    : origen.startsWith(".")
      ? path.resolve(path.dirname(desde), origen)
      : null;
  if (base === null) return null;
  for (const ext of EXTENSIONES) {
    const ruta = `${base}${ext}`;
    if (existsSync(ruta) && /\.tsx?$/.test(ruta)) return ruta;
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
  return salida;
}

/** Todos los ficheros de `src/` a los que llega `inicio`, con rutas relativas a `src/`. */
export function alcanceDe(inicio: string): Set<string> {
  const visto = new Set<string>();
  const pendientes = [path.join(RAIZ, inicio)];
  while (pendientes.length > 0) {
    const fichero = pendientes.pop() as string;
    const relativa = path.relative(RAIZ, fichero).split(path.sep).join("/");
    if (visto.has(relativa)) continue;
    visto.add(relativa);
    for (const origen of importacionesDe(readFileSync(fichero, "utf8"))) {
      const destino = resolver(fichero, origen);
      if (destino) pendientes.push(destino);
    }
  }
  return visto;
}

/**
 * Módulos que gastan o pueden gastar dinero, o que hablan con un proveedor: los adaptadores y su registro, los
 * clientes de cada proveedor, la cola, el servicio de generación y la estimación (que consulta el saldo).
 */
export const PROHIBIDOS_SIN_COSTE: readonly RegExp[] = [
  /^server\/proveedores\/registro\.ts$/,
  /^server\/proveedores\/[^/]+\/(?:adaptador|cliente|canto)\.ts$/,
  /^server\/cola\//,
  /^server\/generacion\/(?:servicio|estimacion|seguimiento)\.ts$/,
  /^server\/produccion\/producir\.ts$/,
  /^server\/omni\//,
  /^server\/coherencia\/(?:jev|decidir|percepcion)\.ts$/,
];
