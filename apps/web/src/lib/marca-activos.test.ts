import { describe, expect, test } from "bun:test";
import path from "node:path";
import { LIMITE_FUENTE, motivoFuenteNoValida, motivoTipoDeLogoNoValido } from "./marca-activos";

/** SVG de la revisión: 10 `<use>` por nivel y 5 niveles (10⁵ instancias) en apenas 1 KB. Rasterizado, tardaba 43 s. */
function svgDeUsosAnidados(niveles = 5): Uint8Array {
  const grupos = ['<g id="g0"><path d="M0 0h1v1z"/></g>'];
  for (let i = 1; i <= niveles; i++) {
    grupos.push(`<g id="g${i}">${Array.from({ length: 10 }, () => `<use href="#g${i - 1}"/>`).join("")}</g>`);
  }
  return new TextEncoder().encode(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><defs>${grupos.join("")}</defs><use href="#g${niveles}"/></svg>`,
  );
}

const manrope = new Uint8Array(
  await Bun.file(path.resolve(import.meta.dir, "../fonts/manrope-latin-wght-normal.woff2")).arrayBuffer(),
);

const texto = (t: string) => new TextEncoder().encode(t);

describe("tipo de logotipo", () => {
  test("PNG, JPEG y WebP pasan por su firma", () => {
    for (const mime of ["image/png", "image/jpeg", "image/webp"])
      expect(motivoTipoDeLogoNoValido(new Uint8Array(8), mime)).toBeNull();
  });

  test.each([
    ["SVG con <use> anidados", svgDeUsosAnidados()],
    [
      "SVG con entidades de carácter",
      texto('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="&#117;rl(https://x.test/a)"/></svg>'),
    ],
    [
      "SVG con DOCTYPE y entidades",
      texto('<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;">]><svg>&b;</svg>'),
    ],
    ["SVG con BOM y espacios delante", texto("\uFEFF  \n<svg/>")],
    ["HTML", texto("<html><script>alert(1)</script></html>")],
  ])("se rechaza al momento, sin interpretarlo: %s", (_, bytes) => {
    const inicio = performance.now();
    const motivo = motivoTipoDeLogoNoValido(bytes, null);
    expect(performance.now() - inicio).toBeLessThan(5);
    expect(motivo).toContain("no admite logotipos en SVG");
    expect(motivo).toContain("Convierte tu logotipo a PNG (con fondo transparente) o a WebP");
  });

  test("un GIF o un binario cualquiera se rechaza diciendo qué formatos sí", () => {
    expect(motivoTipoDeLogoNoValido(texto("GIF89a...."), "image/gif")).toContain("PNG, JPEG o WebP");
    expect(motivoTipoDeLogoNoValido(new Uint8Array([0x7f, 0x45, 0x4c, 0x46]), null)).toContain("PNG, JPEG o WebP");
    expect(motivoTipoDeLogoNoValido(new Uint8Array(), null)).toBe("El archivo está vacío.");
  });
});

describe("fuente WOFF2", () => {
  test("una WOFF2 real (Manrope) pasa", () => {
    expect(motivoFuenteNoValida(manrope)).toBeNull();
  });

  test("TTF, OTF y WOFF se rechazan diciendo que hay que convertirlas", () => {
    for (const firma of [
      [0x00, 0x01, 0x00, 0x00],
      [0x4f, 0x54, 0x54, 0x4f],
      [0x77, 0x4f, 0x46, 0x46],
    ]) {
      const bytes = new Uint8Array(64);
      bytes.set(firma);
      expect(motivoFuenteNoValida(bytes)).toMatch(/conviértela a WOFF2/);
    }
  });

  test("una WOFF2 cortada, con la longitud cambiada o con tablas imposibles se rechaza", () => {
    expect(motivoFuenteNoValida(manrope.slice(0, manrope.byteLength - 10))).toMatch(/longitud/);
    const tablas = manrope.slice();
    new DataView(tablas.buffer).setUint16(12, 0);
    expect(motivoFuenteNoValida(tablas)).toMatch(/tablas/);
  });

  test("un ejecutable o un HTML con extensión .woff2 no pasa", () => {
    const html = new TextEncoder().encode(`<script>alert(1)</script>${" ".repeat(64)}`);
    expect(motivoFuenteNoValida(html)).toBe("No es una fuente WOFF2.");
    const elf = new Uint8Array(64);
    elf.set([0x7f, 0x45, 0x4c, 0x46]);
    expect(motivoFuenteNoValida(elf)).toBe("No es una fuente WOFF2.");
  });

  test("vacía, diminuta o por encima del máximo", () => {
    expect(motivoFuenteNoValida(new Uint8Array())).toMatch(/vacío/);
    expect(motivoFuenteNoValida(new Uint8Array(20))).toMatch(/pequeño/);
    expect(motivoFuenteNoValida(new Uint8Array(LIMITE_FUENTE + 1))).toMatch(/MB/);
  });
});
