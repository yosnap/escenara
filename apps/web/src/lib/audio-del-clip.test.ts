import { describe, expect, test } from "bun:test";
import {
  type ClipProducidoVista,
  comoPonerVozEnOff,
  comoSuenaLaEscena,
  escenaSinAudio,
  subtitulosSinAudio,
} from "./audio-del-clip";
import type { Medio } from "./media/tipos";

const clip = (parcial: Partial<ClipProducidoVista> = {}): ClipProducidoVista => ({
  escenaId: "e1",
  orden: 1,
  medio: { id: "m1", url: "" } as Medio,
  hablaEnElClip: true,
  audioQuitado: false,
  conPistaDeVoz: false,
  conDialogo: true,
  ...parcial,
});

describe("qué se oye de una escena", () => {
  test("en modo clip, un clip hablado suena con su voz y quitado suena sin ella", () => {
    expect(comoSuenaLaEscena(clip(), "clip")).toContain("la voz que trae el propio clip");
    expect(comoSuenaLaEscena(clip({ audioQuitado: true }), "clip")).toContain("sin voz");
  });

  test("en modo pista, clip hablado más pista avisa de las dos voces", () => {
    expect(comoSuenaLaEscena(clip({ conPistaDeVoz: true }), "pista")).toContain("dos voces");
  });

  test("en modo pista, con el audio quitado se oye solo la pista, o nada si aún no está", () => {
    expect(comoSuenaLaEscena(clip({ audioQuitado: true, conPistaDeVoz: true }), "pista")).toContain("solo su pista");
    expect(comoSuenaLaEscena(clip({ audioQuitado: true }), "pista")).toContain("no se oirá ninguna voz");
  });

  test("un clip mudo con pista suena con la pista sobre su ambiente", () => {
    expect(comoSuenaLaEscena(clip({ hablaEnElClip: false, conPistaDeVoz: true }), "pista")).toContain(
      "sobre el sonido ambiente",
    );
  });
});

describe("cómo ponerle voz en off", () => {
  test("en modo clip dice que pase a pista y que quite el audio si el clip habla", () => {
    const texto = comoPonerVozEnOff(clip(), "clip") ?? "";
    expect(texto).toContain("Pista de voz aparte");
    expect(texto).toContain("confirmando su coste");
    expect(texto).toContain("Quita también el audio del clip");
  });

  test("sin diálogo, primero hay que escribir lo que se dice", () => {
    expect(comoPonerVozEnOff(clip({ conDialogo: false, hablaEnElClip: false }), "pista")).toContain(
      "escribe en la escena lo que se dice",
    );
  });

  test("con la pista ya generada no hay nada que explicar", () => {
    expect(comoPonerVozEnOff(clip({ conPistaDeVoz: true }), "pista")).toBeNull();
  });

  test("en modo Omni dice que la voz va dentro del clip", () => {
    expect(comoPonerVozEnOff(clip(), "omni")).toContain("Omni");
  });
});

describe("subtítulos de una escena que no suena", () => {
  test("audio del clip quitado sin pista aparte: no hay nada que subtitular", () => {
    expect(subtitulosSinAudio({ audioQuitado: true, conPistaDeVoz: false }, "clip")).toBe(true);
    expect(subtitulosSinAudio({ audioQuitado: true, conPistaDeVoz: false }, "pista")).toBe(true);
    expect(escenaSinAudio({ clipAudioMuted: true, voiceMediaId: null }, "clip")).toBe(true);
  });

  test("con pista de voz aparte los subtítulos siguen, y con el audio puesto también", () => {
    expect(subtitulosSinAudio({ audioQuitado: true, conPistaDeVoz: true }, "pista")).toBe(false);
    expect(subtitulosSinAudio({ audioQuitado: false, conPistaDeVoz: false }, "clip")).toBe(false);
    // Una pista guardada de cuando el proyecto era «pista» no suena en modo «clip».
    expect(escenaSinAudio({ clipAudioMuted: true, voiceMediaId: "v1" }, "clip")).toBe(true);
  });
});
