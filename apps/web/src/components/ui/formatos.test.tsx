import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SelectorFormatos, SelectorPlataforma } from "./formatos";

describe("el selector por plataforma", () => {
  test("nombra cada formato por su plataforma y su proporción", () => {
    const html = renderToStaticMarkup(
      <SelectorPlataforma etiqueta="¿Para qué es?" valor="vertical_9_16" onCambio={() => {}} />,
    );
    for (const nombre of [
      "Reels · TikTok · Stories (9:16)",
      "Instagram feed y carrusel (4:5)",
      "Cuadrado (1:1)",
      "YouTube · horizontal (16:9)",
    ]) {
      expect(html).toContain(nombre);
    }
  });

  test("un formato que no se puede generar sale deshabilitado y con su motivo, no escondido", () => {
    const html = renderToStaticMarkup(
      <SelectorPlataforma
        etiqueta="¿Para qué es?"
        valor="vertical_9_16"
        motivos={{ horizontal_16_9: "Nano Banana 2 Lite solo admite 9:16." }}
        onCambio={() => {}}
      />,
    );
    expect(html).toContain("Nano Banana 2 Lite solo admite 9:16.");
    const boton = html.slice(html.lastIndexOf("<button", html.indexOf("YouTube")), html.indexOf("YouTube"));
    expect(boton).toContain("disabled");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });

  test("en el montaje, el principal va marcado y no se puede quitar; los demás se añaden", () => {
    const html = renderToStaticMarkup(
      <SelectorFormatos etiqueta="Formatos" formatos={["vertical_9_16", "cuadrado_1_1"]} onCambio={() => {}} />,
    );
    expect(html).toContain("Principal");
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(2);
    const principal = html.slice(html.lastIndexOf("<button", html.indexOf("Reels")), html.indexOf("Reels"));
    expect(principal).toContain("disabled");
  });
});
