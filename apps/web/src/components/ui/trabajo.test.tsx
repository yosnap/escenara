import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EsperaTrabajo, etiquetaTipoTrabajo } from "./trabajo";

/** La espera dice la duración que se pidió de verdad, nunca una fija. */
describe("etiqueta de la espera", () => {
  test("un clip dice su duración real", () => {
    expect(etiquetaTipoTrabajo("animacion", 5)).toBe("Clip de 5 s");
    expect(etiquetaTipoTrabajo("animacion", 10)).toBe("Clip de 10 s");
  });

  test("un clip sin duración guardada no se inventa ninguna", () => {
    expect(etiquetaTipoTrabajo("animacion", null)).toBe("Clip");
    expect(etiquetaTipoTrabajo("animacion")).toBe("Clip");
  });

  test("fotograma y voz no llevan duración", () => {
    expect(etiquetaTipoTrabajo("fotograma", 5)).toBe("Fotograma");
    expect(etiquetaTipoTrabajo("voz")).toBe("Voz de la escena");
  });

  test("la tarjeta pinta la duración del trabajo", () => {
    const html = renderToStaticMarkup(
      <EsperaTrabajo tipo="animacion" segundos={5} estado="en_curso" estadoProveedor={null} transcurridoSegundos={3} />,
    );
    expect(html).toContain("Clip de 5 s");
    expect(html).not.toContain("Clip de 4 s");
  });
});
