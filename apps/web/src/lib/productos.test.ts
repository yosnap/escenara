import { describe, expect, test } from "bun:test";
import { PAPELES_GENERABLES, PAPELES_POR_TIPO, papelPorDefecto, TIPOS_PRODUCTO } from "./productos";

/**
 * El papel con el que entra una foto no puede afirmar algo que la foto quizá no tiene: «Frontal con la etiqueta» es
 * la que se compara con el resultado, y ponérsela a una foto sin etiqueta engaña a la comparación.
 */
describe("papel de una foto al añadirla", () => {
  test("un producto físico entra con la vista general del envase, no con la etiqueta", () => {
    expect(papelPorDefecto("fisico")).toBe("envase");
  });

  test("un producto digital entra como captura de pantalla", () => {
    expect(papelPorDefecto("digital")).toBe("captura_pantalla");
  });

  test("el papel de partida siempre es uno de los que admite el tipo", () => {
    for (const tipo of TIPOS_PRODUCTO) expect(PAPELES_POR_TIPO[tipo]).toContain(papelPorDefecto(tipo));
  });
});

describe("vistas que se pueden generar", () => {
  test("una captura de pantalla no se inventa: se sube la de verdad", () => {
    for (const tipo of TIPOS_PRODUCTO) expect(PAPELES_GENERABLES[tipo]).not.toContain("captura_pantalla");
  });

  test("un producto físico puede generar la frontal, el envase, el detalle y el producto solo", () => {
    expect([...PAPELES_GENERABLES.fisico]).toEqual(["etiqueta", "envase", "mecanismo", "suelto"]);
  });

  test("cada vista generable es un papel válido de su tipo", () => {
    for (const tipo of TIPOS_PRODUCTO) {
      for (const papel of PAPELES_GENERABLES[tipo]) expect(PAPELES_POR_TIPO[tipo]).toContain(papel);
    }
  });
});
