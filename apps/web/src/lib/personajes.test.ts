import { describe, expect, test } from "bun:test";
import { etiquetaDeTipo, resumenDeReferencias } from "./personajes";

/** Un inventado se presenta como inventado y su progreso habla de retratos y vistas, nunca de fotos. */
describe("cómo se presenta un personaje", () => {
  test("un inventado dice que es inventado; uno real, su tipo", () => {
    expect(etiquetaDeTipo({ tipo: "persona", inventado: true })).toBe("Persona inventada");
    expect(etiquetaDeTipo({ tipo: "animal", inventado: true })).toBe("Animal inventado");
    expect(etiquetaDeTipo({ tipo: "persona", inventado: false })).toBe("Persona");
    expect(etiquetaDeTipo({ tipo: "animal", inventado: false })).toBe("Animal");
  });

  test("el progreso de un inventado cuenta su retrato y sus vistas; el de uno real, sus fotos", () => {
    expect(resumenDeReferencias({ inventado: true, totalReferencias: 0, minimoReferencias: 3 })).toBe(
      "0 de 3 imágenes entre retrato y vistas",
    );
    expect(resumenDeReferencias({ inventado: false, totalReferencias: 1, minimoReferencias: 3 })).toBe(
      "1 foto de 3 mínimas",
    );
  });
});
