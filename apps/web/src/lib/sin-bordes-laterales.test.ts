import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

// Norma del propietario: ninguna tarjeta o bloque lleva un borde o sombra de color solo en un lateral
// (el típico acento a la izquierda). Se usan bordes completos u otra solución.
const RAIZ = path.resolve(import.meta.dir, "..");
const PATRONES = [
  /\bborder-(l|r|s|e)(-\d+|-\[[^\]]+\])?\b/, // border-l, border-l-4, border-s-[3px]…
  /\bborder-(l|r|s|e)-(?!0\b)[a-z]/, // border-l-acento…
  /\bshadow-\[-?\d+px_0/, // sombra desplazada solo en horizontal
  /border(Left|Right|InlineStart|InlineEnd)\s*:/, // estilos en línea
];

async function ficheros(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true });
  const listas = await Promise.all(
    entradas.map((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return ficheros(ruta);
      return /\.(tsx?|css)$/.test(e.name) && !e.name.endsWith(".test.ts") ? [ruta] : [];
    }),
  );
  return listas.flat();
}

describe("sin bordes de color en un lateral", () => {
  it("ningún componente usa bordes o sombras laterales de acento", async () => {
    const infractores: string[] = [];
    for (const f of await ficheros(RAIZ)) {
      const codigo = await Bun.file(f).text();
      if (PATRONES.some((p) => p.test(codigo))) infractores.push(path.relative(RAIZ, f));
    }
    expect(infractores).toEqual([]);
  });

  it("el detector reconoce los patrones prohibidos y respeta los bordes completos", () => {
    const detecta = (c: string) => PATRONES.some((p) => p.test(c));
    expect(detecta('className="border-l-4 border-error"')).toBe(true);
    expect(detecta('className="border-s-2"')).toBe(true);
    expect(detecta("style={{ borderLeft: '4px solid red' }}")).toBe(true);
    expect(detecta('className="border-2 border-error/45 rounded-tarjeta"')).toBe(false);
    expect(detecta('className="border border-borde"')).toBe(false);
  });
});
