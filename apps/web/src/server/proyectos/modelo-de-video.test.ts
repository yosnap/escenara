import { expect, test } from "bun:test";
import { modeloFijadoParaElModo } from "./modelo-de-video";

/**
 * La parte del lector que no mira el catálogo. Que un modelo retirado o sin precio también se ignore lo comprueba
 * `modelo-de-video.integracion.test.ts`, contra el catálogo de verdad.
 */
test("sin modelo fijado se usa el mapa de la cuenta, como antes de existir la columna", () => {
  expect(modeloFijadoParaElModo({ videoModel: "", voiceMode: "clip" })).toBeNull();
  expect(modeloFijadoParaElModo({ videoModel: "   ", voiceMode: "pista" })).toBeNull();
});

test("un modelo fijado manda en los modos de clip y de pista", () => {
  expect(modeloFijadoParaElModo({ videoModel: "veo3_lite", voiceMode: "clip" })).toBe("veo3_lite");
  expect(modeloFijadoParaElModo({ videoModel: "hailuo/2-3-image-to-video-standard", voiceMode: "pista" })).toBe(
    "hailuo/2-3-image-to-video-standard",
  );
});

test("en modo de voz e identidad registradas solo vale un modelo de escenas habladas", () => {
  expect(modeloFijadoParaElModo({ videoModel: "google/gemini-omni-flash-1-1", voiceMode: "omni" })).toBe(
    "google/gemini-omni-flash-1-1",
  );
  // Un modelo de clip fijado antes de cambiar de modo se ignora en lugar de romper la producción.
  expect(modeloFijadoParaElModo({ videoModel: "veo3_lite", voiceMode: "omni" })).toBeNull();
});
