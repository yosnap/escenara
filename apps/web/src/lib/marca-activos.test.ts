import { describe, expect, test } from "bun:test";
import path from "node:path";
import { LIMITE_FUENTE, LIMITE_SVG, motivoFuenteNoValida, motivoSvgNoValido } from "./marca-activos";

const svg = (cuerpo: string, atributos = "") =>
  new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"${atributos}>${cuerpo}</svg>`);

const manrope = new Uint8Array(
  await Bun.file(path.resolve(import.meta.dir, "../fonts/manrope-latin-wght-normal.woff2")).arrayBuffer(),
);

describe("logotipo en SVG", () => {
  test("un logotipo normal, con degradados, referencias internas y comentarios, pasa", () => {
    const bueno = `<?xml version="1.0" encoding="UTF-8"?>
<!-- logotipo -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#2753D7"/></linearGradient><symbol id="s"><circle r="4"/></symbol></defs>
  <title>Mi marca</title>
  <path d="M10 10H90V90Z" fill="url(#g)" style="stroke: #000"/>
  <use xlink:href="#s" x="5"/><use href="#s"/>
  <text x="10" y="50" font-family="Inter">Mi marca &amp; co</text>
</svg>`;
    expect(motivoSvgNoValido(new TextEncoder().encode(bueno))).toBeNull();
  });

  test.each([
    ["<script>", svg("<script>alert(1)</script>"), /script/],
    [
      "foreignObject",
      svg('<foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>'),
      /foreignObject/,
    ],
    ["manejador onload", svg("", ' onload="alert(1)"'), /manejador/],
    ["manejador en un hijo", svg('<rect width="1" height="1" onclick="x()"/>'), /manejador/],
    ["enlace externo", svg('<use href="https://x.test/a.svg#s"/>'), /fuera/],
    ["javascript: en un enlace", svg('<a href="javascript:alert(1)"><rect/></a>'), /<a>|fuera/],
    ["url() externa", svg('<rect fill="url(https://x.test/p)"/>'), /url\(\)/],
    ["url() externa en style", svg('<rect style="fill:url(//x.test/p)"/>'), /url\(\)/],
    ["data: en un valor", svg('<rect fill="data:image/png;base64,AAAA"/>'), /valor/],
    ["<image>", svg('<image href="#x"/>'), /image/],
    ["<style>", svg("<style>@import url(x)</style>"), /style/],
    [
      "DOCTYPE con entidades",
      new TextEncoder().encode('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>'),
      /DOCTYPE/,
    ],
    ["CDATA", svg("<text><![CDATA[<script>]]></text>"), /CDATA/],
    ["atributo sin comillas", svg("<rect width=10/>"), /comillas/],
    ["espacio de nombres ajeno", svg("", ' xmlns:h="http://www.w3.org/1999/xhtml"'), /espacio de nombres/],
    ["HTML en lugar de SVG", new TextEncoder().encode("<html><body>hola</body></html>"), /<svg>/],
    ["< suelto", svg("<rect/> < script"), /bien formado/],
    ["instrucción de procesamiento", svg('<?xml-stylesheet href="x.css"?>'), /procesamiento/],
  ])("se rechaza con su causa: %s", (_, bytes, causa) => {
    expect(motivoSvgNoValido(bytes)).toMatch(causa);
  });

  test("vacío, demasiado grande o no UTF-8", () => {
    expect(motivoSvgNoValido(new Uint8Array())).toMatch(/vacío/);
    expect(motivoSvgNoValido(svg(`<desc>${"x".repeat(LIMITE_SVG)}</desc>`))).toMatch(/KB/);
    expect(motivoSvgNoValido(new Uint8Array([0x3c, 0x73, 0xff, 0xfe]))).toMatch(/UTF-8/);
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
