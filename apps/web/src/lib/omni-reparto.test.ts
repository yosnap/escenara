import { describe, expect, test } from "bun:test";
import { motivoSinReparto } from "./omni";

/**
 * El podcast y el dualcast solo se producen con el modelo con el que se han producido de verdad. `gemini-omni-video`
 * documenta `character_ids`, pero el mismo dualcast falló dos veces en KIE con «fallo interno»: no se le manda.
 */
describe("modelos que admiten una escena con dos personajes", () => {
  test("Gemini Omni 1.1 Flash sí", () => {
    expect(motivoSinReparto({ modelo: "google/gemini-omni-flash-1-1", nombre: "Gemini Omni 1.1 Flash" })).toBeNull();
  });

  test("Gemini Omni (vídeo) no, y el motivo dice la causa y qué modelo elegir", () => {
    const motivo = motivoSinReparto({ modelo: "gemini-omni-video", nombre: "Gemini Omni (vídeo)" });
    expect(motivo).toContain("Gemini Omni (vídeo)");
    expect(motivo).toContain("fallo interno");
    expect(motivo).toContain("Gemini Omni 1.1 Flash");
  });

  test("un motor de referencias no, porque no registra identidades", () => {
    const motivo = motivoSinReparto({ modelo: "minimax-h3/reference-to-video", nombre: "MiniMax H3" });
    expect(motivo).toContain("no admite identidades registradas");
  });
});
