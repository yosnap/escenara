import { describe, expect, test } from "bun:test";
import type { RepartoDeEnvio } from "@/lib/reparto-envio";
import { promptEscenaHablada } from "./modelos";

/**
 * **El prompt de una escena con dos personajes** (0.28.0). Lo que se comprueba aquí es exactamente lo que se midió
 * el 2026-09-29 que hace falta para que el proveedor no reparta las caras ni las frases al azar:
 *
 * - cada personaje **nombrado** y atado a **su lado** del cuadro;
 * - un turno por línea, con la frase **literal en castellano y sin traducir**;
 * - lo que hace el otro mientras: escuchar y reaccionar, sin hablar;
 * - en podcast, **un solo personaje en el plano**, con su mirada al lado del otro y la frase de que no hay nadie más.
 */

const ESCENA = "A warm living room at golden hour, medium shot.";

const dualcast: RepartoDeEnvio = {
  formato: "dualcast",
  presentes: [
    { nombre: "Elisa", lado: "izquierda", mirada: "camara", habla: true },
    { nombre: "Marco", lado: "derecha", mirada: "camara", habla: true },
  ],
  turnos: [
    { nombre: "Elisa", texto: "Esto lo cambia todo, ¿no te parece?", direccion: "in a warm tone" },
    { nombre: "Marco", texto: "A mí me costó creerlo la primera vez.", direccion: "" },
  ],
  orden: 1,
};

const podcast: RepartoDeEnvio = {
  formato: "podcast",
  presentes: [{ nombre: "Elisa", lado: "izquierda", mirada: "derecha", habla: true }],
  turnos: [{ nombre: "Elisa", texto: "Esto lo cambia todo, ¿no te parece?", direccion: "" }],
  orden: 1,
};

describe("dualcast", () => {
  const prompt = promptEscenaHablada(ESCENA, "lo que sea", dualcast);

  test("nombra a cada personaje con su lado del cuadro", () => {
    expect(prompt).toContain("The person on the LEFT of the frame is Elisa.");
    expect(prompt).toContain("The person on the RIGHT of the frame is Marco.");
  });

  test("lleva los turnos en orden, literales y sin traducir", () => {
    expect(prompt).toContain('1. Elisa says in Spanish (in a warm tone): "Esto lo cambia todo, ¿no te parece?"');
    expect(prompt).toContain('2. Marco says in Spanish: "A mí me costó creerlo la primera vez."');
    expect(prompt.indexOf("1. Elisa")).toBeLessThan(prompt.indexOf("2. Marco"));
  });

  test("dice que el otro escucha y no habla, que es lo que impide que hablen los dos a la vez", () => {
    expect(prompt).toContain("while Marco listens and reacts without speaking.");
    expect(prompt).toContain("while Elisa listens and reacts without speaking.");
  });

  test("no cuela el diálogo plano de una escena de un personaje", () => {
    expect(prompt).not.toContain("The character looks at the camera");
    expect(prompt).not.toContain("lo que sea");
  });

  test("lleva la escena y los negativos, como cualquier otro clip", () => {
    expect(prompt).toContain(ESCENA);
    expect(prompt).toContain("No subtitles");
    expect(prompt).toContain("Spoken audio only.");
  });
});

describe("podcast", () => {
  const prompt = promptEscenaHablada(ESCENA, "lo que sea", podcast);

  test("sale un solo personaje, mirando al lado donde estaría el otro", () => {
    expect(prompt).toContain("Only one person is in frame: Elisa, on the LEFT of the frame.");
    expect(prompt).toContain("looks off-camera to the RIGHT of the frame");
  });

  test("dice expresamente que no hay nadie más en el plano", () => {
    expect(prompt).toContain("Nobody else is in frame");
  });

  test("solo lleva sus turnos, literales", () => {
    expect(prompt).toContain('1. Elisa says in Spanish: "Esto lo cambia todo, ¿no te parece?"');
    expect(prompt).not.toContain("Marco");
  });
});

describe("sin turnos", () => {
  test("un clip en el que solo escucha sale con sonido ambiente y sin voz", () => {
    const prompt = promptEscenaHablada(ESCENA, "", { ...podcast, turnos: [] });
    expect(prompt).toContain("listens and reacts to what the other person is saying, without speaking.");
    expect(prompt).toContain("Audio: the natural ambient sound");
    expect(prompt).not.toContain("Spoken audio only.");
  });
});

describe("sin reparto", () => {
  test("una escena de un personaje sale exactamente como antes de esta versión", () => {
    const prompt = promptEscenaHablada(ESCENA, "Hola, esto es lo que digo.");
    expect(prompt).toContain('The character looks at the camera, saying in Spanish: "Hola, esto es lo que digo."');
    expect(prompt).not.toContain("frame is");
  });
});
