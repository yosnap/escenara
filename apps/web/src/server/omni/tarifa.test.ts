import { describe, expect, test } from "bun:test";
import { creditosDeTarifa } from "./escena";

/**
 * Cada duración de Gemini Omni tiene su tarifa publicada (63, 84, 105 y 126 créditos a 4, 6, 8 y 10 s). La tarifa
 * de una duración se cobra tal cual: escalarla otra vez por los segundos sería cobrar hasta 2,5 veces de más.
 */
describe("créditos de una escena hablada", () => {
  const OMNI = "google/gemini-omni-flash-1-1";

  test("la tarifa propia de la duración se cobra sin escalar", () => {
    expect(creditosDeTarifa({ unidad: "clip de 4 s a 720p", creditos: 63 }, 4, OMNI)).toBe(63);
    expect(creditosDeTarifa({ unidad: "clip de 6 s a 720p", creditos: 84 }, 6, OMNI)).toBe(84);
    expect(creditosDeTarifa({ unidad: "clip de 8 s a 720p", creditos: 105 }, 8, OMNI)).toBe(105);
    expect(creditosDeTarifa({ unidad: "clip de 10 s a 720p", creditos: 126 }, 10, OMNI)).toBe(126);
  });

  test("sin tarifa propia se estima en proporción desde los segundos de la que se leyó", () => {
    expect(creditosDeTarifa({ unidad: "clip de 4 s a 720p", creditos: 63 }, 8, OMNI)).toBe(126);
  });

  test("nunca baja del precio registrado", () => {
    expect(creditosDeTarifa({ unidad: "clip de 8 s a 720p", creditos: 105 }, 4, OMNI)).toBe(105);
  });
});
