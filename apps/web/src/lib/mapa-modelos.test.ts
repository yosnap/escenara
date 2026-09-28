import { describe, expect, test } from "bun:test";
import { entradasValidas } from "./mapa-modelos";

describe("tamaño del mapa", () => {
  test("se pueden guardar los ocho modelos de vídeo recomendados, en el orden que se quiera", () => {
    const ocho = Array.from({ length: 8 }, (_, i) => ({ proveedor: "kie", compatibleId: null, modelo: `modelo-${i}` }));
    expect(entradasValidas(ocho.reverse())?.length).toBe(8);
  });
});
