import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Candados de código sobre dónde se decide y quién ve la sombra.
 *
 * 1. **Todas las decisiones del motor se registran**: el motor (`evaluar`) solo se llama desde la puerta (y desde la
 *    vista del canto, que solo pinta), y la puerta solo lo usa en funciones que guardan la evaluación o que solo pintan
 *    (`evaluarParaMostrar`). Un camino nuevo que llamara al motor por su cuenta decidiría sin dejar rastro.
 * 2. **La opinión de la sombra no llega al usuario**: sus lecturas solo se importan desde el panel de administración,
 *    igual que el conjunto etiquetado que se deriva de ellas.
 */
const RAIZ = path.resolve(import.meta.dir, "../..");

async function ficheros(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true });
  const listas = await Promise.all(
    entradas.map((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return ficheros(ruta);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [ruta] : [];
    }),
  );
  return listas.flat();
}

const relativa = (ruta: string) => path.relative(RAIZ, ruta).split(path.sep).join("/");

const esElMotor = (fichero: string, origen: string) => {
  const destino = origen.startsWith(".") ? relativa(path.resolve(path.dirname(fichero), origen)) : origen;
  return /(?:^|\/)controles\/motor(?:\.ts)?$/.test(destino);
};

/**
 * ¿Este fichero puede llamar al motor? Cuenta un `import { evaluar }` (con o sin alias), cualquier importación de todo
 * el módulo (`import * as`, `import motor from`), una importación dinámica y una reexportación: con cualquiera de
 * ellas se puede decidir sin pasar por la puerta.
 */
function usaElMotor(fichero: string, codigo: string): boolean {
  for (const m of codigo.matchAll(/\bimport\s+(?:type\s+)?([^;]*?)\s+from\s*["']([^"']+)["']/g)) {
    const [, clausula = "", origen = ""] = m;
    if (!esElMotor(fichero, origen) || clausula.startsWith("type ")) continue;
    if (!clausula.startsWith("{") || /\bevaluar\b/.test(clausula)) return true;
  }
  for (const m of codigo.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) {
    if (esElMotor(fichero, m[1] ?? "")) return true;
  }
  for (const m of codigo.matchAll(/\bexport\s+(\*|\{[^}]*\})\s*from\s*["']([^"']+)["']/g)) {
    const [, clausula = "", origen = ""] = m;
    if (esElMotor(fichero, origen) && (clausula === "*" || /\bevaluar\b/.test(clausula))) return true;
  }
  return false;
}

describe("detector de usos del motor", () => {
  const f = path.join(RAIZ, "server/otra/cosa.ts");
  it.each([
    ['import { evaluar } from "../controles/motor";', true],
    ['import { evaluar as decidir } from "@/server/controles/motor";', true],
    ['import * as motor from "../controles/motor";', true],
    ['const { evaluar } = await import("../controles/motor");', true],
    ['export { evaluar } from "../controles/motor";', true],
    ['export * from "../controles/motor";', true],
    ['import { frenosQueGatean } from "../controles/motor";', false],
    ['import type { Hechos } from "../controles/motor";', false],
    ['import { evaluar } from "../otra/motor";', false],
  ])("%s", (codigo, esperado) => {
    expect(usaElMotor(f, codigo)).toBe(esperado);
  });
});

describe("puntos de decisión", () => {
  it("el motor solo se llama desde la puerta, que registra lo que decide", async () => {
    const llaman: string[] = [];
    for (const f of await ficheros(RAIZ)) {
      if (usaElMotor(f, await readFile(f, "utf8"))) llaman.push(relativa(f));
    }
    // La vista del canto solo pinta los impedimentos de la pantalla: no deja pasar ni frena nada, el envío pasa
    // después por la puerta completa.
    expect(llaman.sort()).toEqual(["server/canto/consulta.ts", "server/controles/puerta.ts"]);

    const puerta = await readFile(path.join(RAIZ, "server/controles/puerta.ts"), "utf8");
    // Cada función de la puerta que evalúa, o guarda la evaluación, o es la de solo pintar.
    const funciones = puerta.split(/\nexport /).filter((bloque) => /\bevaluar\s*\(/.test(bloque));
    for (const bloque of funciones) {
      const registra = bloque.includes("registrarEvaluacion(");
      const soloPinta = bloque.startsWith("const evaluarParaMostrar");
      expect(registra || soloPinta).toBe(true);
    }
    expect(funciones.length).toBeGreaterThanOrEqual(3);
  });

  it("las lecturas de la sombra solo se usan en el panel de administración", async () => {
    const importan: string[] = [];
    for (const f of await ficheros(RAIZ)) {
      const codigo = await readFile(f, "utf8");
      if (/from\s*["'][^"']*decisiones\/consulta["']/.test(codigo)) importan.push(relativa(f));
    }
    // La calibración deriva de ahí sus etiquetas, y a su vez solo la lee el panel de administración.
    expect(importan.sort()).toEqual(["app/admin/decisiones/page.tsx", "server/calibracion/conjunto.ts"]);
  });

  it("la calibración y su conjunto etiquetado solo se usan en el panel de administración", async () => {
    const importan: string[] = [];
    for (const f of await ficheros(RAIZ)) {
      const codigo = await readFile(f, "utf8");
      if (/from\s*["'][^"']*calibracion\/(?:conjunto|calibrar)["']/.test(codigo)) importan.push(relativa(f));
    }
    expect(importan.sort()).toEqual(["app/admin/calibracion/page.tsx", "app/api/admin/calibracion/route.ts"]);
  });
});
