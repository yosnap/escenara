import { describe, expect, test } from "bun:test";
import type { EleccionDeTrabajo } from "../generacion/precios";
import { type CosteDeEscenaOmni, promptDelEnvio, totalDeEscenaOmni } from "./escena";
import { estimacionDeEscenaOmni } from "./estimacion-plan";

/**
 * El plan, el editor y la producción enseñan lo que cuesta una escena hablada con **la misma cuenta** que la
 * confirmación: el modelo Omni, su duración y su tarifa, más la traducción una sola vez. Antes sumaban fotograma y
 * animación del mapa («Nano Banana 2 Lite + Veo 3.1 Fast · 8 s · 64 créditos») mientras se confirmaban 65.
 */
describe("coste de una escena hablada en el plan", () => {
  // Solo se leen el nombre, el proveedor, el precio y su sello: el resto de la elección no interviene en la cuenta.
  const eleccion = {
    modelo: { modelo: "google/gemini-omni-flash-1-1", nombre: "Gemini Omni 1.1 Flash", proveedor: "kie" },
    precio: { creditos: 63, sello: "kie:gemini-omni:4s@v1", comprobado: "2026-10-01" },
  } as unknown as EleccionDeTrabajo;
  const coste: CosteDeEscenaOmni = {
    eleccion,
    segundos: 4,
    creditosPorClip: 63,
    creditosDelPrimerClip: 65,
    precioEstimado: false,
  };

  test("una escena de un clip cuesta lo mismo que se confirma: la tarifa más la traducción", () => {
    expect(totalDeEscenaOmni(coste, 1)).toBe(65);
    const estimacion = estimacionDeEscenaOmni(coste, 1, 0.005);
    expect(estimacion.creditos).toBe(65);
    expect(estimacion.margen).toBe(0);
    expect(estimacion.euros).toBeCloseTo(0.325);
  });

  test("dice el modelo Omni y su duración, sin modelo de fotograma", () => {
    const estimacion = estimacionDeEscenaOmni(coste, 1, 0.005);
    expect(estimacion.modeloFotograma).toBe("");
    expect(estimacion.creditosFotograma).toBe(0);
    expect(estimacion.modeloAnimacion).toBe("Gemini Omni 1.1 Flash");
    expect(estimacion.segundos).toBe(4);
    expect(estimacion.selloAnimacion).toBe("kie:gemini-omni:4s@v1");
    expect(estimacion.selloFotograma).toBe("");
  });

  test("un reparto con un modelo que no lo admite queda bloqueado en el plan con su causa", () => {
    const video = {
      ...coste,
      eleccion: {
        ...eleccion,
        modelo: { ...eleccion.modelo, modelo: "gemini-omni-video", nombre: "Gemini Omni (vídeo)" },
      },
    } as CosteDeEscenaOmni;
    expect(estimacionDeEscenaOmni(video, 1, 0.005, true).bloqueo).toContain("Validado con dos personas");
    expect(estimacionDeEscenaOmni(video, 1, 0.005, false).bloqueo).toBeUndefined();
    expect(estimacionDeEscenaOmni(coste, 1, 0.005, true).bloqueo).toBeUndefined();
  });

  test("un podcast cuenta sus dos clips y la traducción una sola vez", () => {
    expect(totalDeEscenaOmni(coste, 2)).toBe(128);
    expect(estimacionDeEscenaOmni(coste, 2, 0.005).creditos).toBe(128);
  });
});

describe("prompt de un envío hablado", () => {
  const escena = "Two people are in frame at the same time.";
  const ficha = "Maintain the identity of the same person from the reference photos: Twenty-eight-year-old woman.";

  test("con reparto no viaja la ficha del protagonista: cada cara la pone su character_id", () => {
    expect(promptDelEnvio(escena, ficha, true)).toBe(escena);
  });

  test("con un solo personaje la ficha sigue viajando como siempre", () => {
    const prompt = promptDelEnvio(escena, ficha, false);
    expect(prompt).toContain(escena);
    expect(prompt).toContain("Twenty-eight-year-old woman");
  });
});
