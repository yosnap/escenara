import { describe, expect, test } from "bun:test";
import { entradaAnimacion, entradaFotograma, promptAnimacion, promptFotograma } from "./modelos";

/**
 * Construcción de los prompts. La regla que justifica estos tests salió de la comparativa real del
 * 2026-09-27: con la frase dentro del prompt, los modelos de imagen la dibujaban en el fotograma
 * (subtítulo, bocadillo o rótulo) y el clip la heredaba.
 */

const ESCENA = "En una cafetería luminosa, saluda a cámara con una sonrisa.";
const FRASE = "Estamos muy contentos de lanzar esto";

describe("prompt del fotograma", () => {
  test("lleva la descripción visual y prohíbe cualquier texto en la imagen", () => {
    const prompt = promptFotograma(ESCENA);
    expect(prompt).toStartWith(ESCENA);
    expect(prompt).toContain("No added text");
    expect(prompt).toContain("subtitles");
    expect(prompt).toContain("speech bubbles");
  });

  test("no hay forma de que lo que dice el personaje llegue al modelo de imagen", () => {
    // La función solo recibe la escena: el diálogo no tiene por dónde entrar.
    expect(promptFotograma(ESCENA)).not.toContain(FRASE);
    expect(entradaFotograma(ESCENA, ["https://tempfile.kie.ai/a.png"]).prompt).not.toContain(FRASE);
  });
});

describe("prompt del clip", () => {
  test("pone primero lo que dice, con dos puntos y sin comillas, y pide labios sincronizados", () => {
    const prompt = promptAnimacion(ESCENA, FRASE);
    expect(prompt).toStartWith("La persona mira a cámara y dice en español");
    expect(prompt).toContain(`dice en español, con voz natural y labios sincronizados: ${FRASE}`);
    // Las comillas alrededor de la frase hacen que Veo la escriba en pantalla: no se usan.
    expect(prompt).not.toContain(`"${FRASE}"`);
    expect(prompt).toContain(ESCENA);
  });

  test("prohíbe los subtítulos también en el vídeo", () => {
    expect(promptAnimacion(ESCENA, FRASE)).toContain("No subtitles");
    expect(promptAnimacion(ESCENA, FRASE)).toContain("Spoken audio only");
  });

  test("sin frase, el prompt describe el sonido ambiente en positivo, sin prohibir la voz", () => {
    const prompt = promptAnimacion(ESCENA, "");
    expect(prompt).toStartWith(ESCENA);
    expect(prompt).not.toContain("dice en español");
    // Sin sonido descrito, o solo prohibiendo la voz, Veo falla sin cobrar (medido el 2026-09-27).
    expect(prompt).toContain("Audio: the natural ambient sound");
    expect(prompt).not.toContain("nobody speaks");
    expect(prompt).not.toContain("Spoken audio only");
  });

  test("la entrada del clip lleva el prompt montado con la frase", () => {
    const entrada = entradaAnimacion(ESCENA, FRASE, "https://tempfile.kie.ai/a.png", 8);
    expect(entrada.prompt).toBe(promptAnimacion(ESCENA, FRASE));
    expect(entrada.image_urls).toEqual(["https://tempfile.kie.ai/a.png"]);
  });
});
