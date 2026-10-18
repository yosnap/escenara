import { expect, test } from "bun:test";
import { modeloDeVideoDe } from "./modelo-de-video";

test("sin modelo fijado se usa el mapa de la cuenta, como antes de existir la columna", () => {
  expect(modeloDeVideoDe({ videoModel: "", voiceMode: "clip" })).toBeNull();
  expect(modeloDeVideoDe({ videoModel: "   ", voiceMode: "pista" })).toBeNull();
});

test("un modelo fijado manda en los modos de clip y de pista", () => {
  expect(modeloDeVideoDe({ videoModel: "veo3_lite", voiceMode: "clip" })).toBe("veo3_lite");
  expect(modeloDeVideoDe({ videoModel: "hailuo/2-3-image-to-video-standard", voiceMode: "pista" })).toBe(
    "hailuo/2-3-image-to-video-standard",
  );
});

test("en modo de voz e identidad registradas solo vale un modelo de escenas habladas", () => {
  expect(modeloDeVideoDe({ videoModel: "google/gemini-omni-flash-1-1", voiceMode: "omni" })).toBe(
    "google/gemini-omni-flash-1-1",
  );
  // Un modelo de clip fijado antes de cambiar de modo se ignora en lugar de romper la producción.
  expect(modeloDeVideoDe({ videoModel: "veo3_lite", voiceMode: "omni" })).toBeNull();
});
