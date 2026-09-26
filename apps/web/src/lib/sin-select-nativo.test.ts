import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import path from "node:path";

// ADR-0011: en Escenara nunca se usa el <select> nativo del navegador.
const RAIZ = path.resolve(import.meta.dir, "..");
// Uso real del elemento en JSX/HTML o mediante createElement; los comentarios no cuentan.
const PATRONES = [/<select[\s>/]/i, /createElement\(\s*["'`]select["'`]/i];
const sinComentarios = (codigo: string) => codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

async function ficheros(dir: string): Promise<string[]> {
  const entradas = await readdir(dir, { withFileTypes: true });
  const listas = await Promise.all(
    entradas.map((e) => {
      const ruta = path.join(dir, e.name);
      if (e.isDirectory()) return ficheros(ruta);
      return /\.(tsx?|jsx?|html|mdx)$/.test(e.name) && !e.name.endsWith(".test.ts") ? [ruta] : [];
    }),
  );
  return listas.flat();
}

describe("sin <select> nativo", () => {
  it("ningún fichero de src usa el elemento <select>", async () => {
    const infractores: string[] = [];
    for (const f of await ficheros(RAIZ)) {
      const codigo = sinComentarios(await Bun.file(f).text());
      if (PATRONES.some((p) => p.test(codigo))) infractores.push(path.relative(RAIZ, f));
    }
    expect(infractores).toEqual([]);
  });
});

describe("detector del <select> nativo", () => {
  it("detecta JSX y createElement, pero ignora comentarios", () => {
    const detecta = (c: string) => PATRONES.some((p) => p.test(sinComentarios(c)));
    expect(detecta("return <select name='x'>")).toBe(true);
    expect(detecta('React.createElement("select", null)')).toBe(true);
    expect(detecta("// sustituye al <select> nativo")).toBe(false);
    expect(detecta("/** sin <select> */ const a = 1;")).toBe(false);
    expect(detecta("<Selector etiqueta='x' />")).toBe(false);
  });
});
