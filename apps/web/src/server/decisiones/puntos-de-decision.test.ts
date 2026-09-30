import { describe, expect, it } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Candados de código sobre dónde se decide y quién ve la sombra.
 *
 * 1. **Todas las decisiones del motor se registran**: el motor (`evaluar`) solo se llama desde la puerta (y desde la
 *    vista del canto, que solo pinta), y la puerta solo lo usa en funciones que guardan la evaluación o que solo pintan
 *    (`evaluarParaMostrar`). Un camino nuevo que llamara al motor por su cuenta decidiría sin dejar rastro.
 * 2. **La opinión de la sombra no llega al usuario**: sus lecturas solo se importan desde el panel de administración.
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

describe("puntos de decisión", () => {
  it("el motor solo se llama desde la puerta, que registra lo que decide", async () => {
    const llaman: string[] = [];
    for (const f of await ficheros(RAIZ)) {
      const codigo = await readFile(f, "utf8");
      for (const m of codigo.matchAll(/import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
        const [, nombres = "", origen = ""] = m;
        const destino = origen.startsWith(".") ? relativa(path.resolve(path.dirname(f), origen)) : origen;
        if (/\bevaluar\b/.test(nombres) && /(?:^|\/)controles\/motor$/.test(destino)) llaman.push(relativa(f));
      }
    }
    // La vista del canto solo pinta los impedimentos de la pantalla: no deja pasar ni frena nada, el envío pasa
    // después por la puerta completa.
    expect(llaman.sort()).toEqual(["server/canto/consulta.ts", "server/controles/puerta.ts"]);

    const puerta = await readFile(path.join(RAIZ, "server/controles/puerta.ts"), "utf8");
    // Cada función de la puerta que evalúa, o guarda la evaluación, o es la de solo pintar.
    const funciones = puerta.split(/\nexport /).filter((bloque) => /\bevaluar\(hechos\)/.test(bloque));
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
    expect(importan).toEqual(["app/admin/decisiones/page.tsx"]);
  });
});
