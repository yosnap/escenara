import { describe, expect, test } from "bun:test";
import { audioIdEfectivo, faltaDeVoz, type HablanteConVoz } from "./omni";

const ana: HablanteConVoz = { personajeId: "ana", nombre: "Ana", audioIdPropio: "" };
const bea: HablanteConVoz = { personajeId: "bea", nombre: "Bea", audioIdPropio: "" };
const conVoz = (h: HablanteConVoz, audio: string): HablanteConVoz => ({ ...h, audioIdPropio: audio });

describe("con qué voz habla cada personaje", () => {
  test("la suya si la tiene; si no, la del proyecto", () => {
    expect(audioIdEfectivo("audio-ana", "audio-proyecto")).toBe("audio-ana");
    expect(audioIdEfectivo("", "audio-proyecto")).toBe("audio-proyecto");
    expect(audioIdEfectivo("", "")).toBe("");
  });

  test("la protagonista sin voz propia habla con la del proyecto, como siempre", () => {
    expect(faltaDeVoz(ana, [bea], "audio-proyecto", "ana")).toBe("");
  });

  test("el otro personaje sin voz propia sonaría igual que la protagonista: se le pide la suya", () => {
    const falta = faltaDeVoz(bea, [ana, bea], "audio-proyecto", "ana");
    expect(falta).toContain("«Ana»");
    expect(falta).toContain("no cuesta créditos");
  });

  test("con su propia voz no hay nada que pedir", () => {
    expect(faltaDeVoz(conVoz(bea, "audio-bea"), [ana], "audio-proyecto", "ana")).toBe("");
  });

  test("si la protagonista tiene la suya, el otro puede hablar con la del proyecto sin repetir timbre", () => {
    expect(faltaDeVoz(bea, [conVoz(ana, "audio-ana")], "audio-proyecto", "ana")).toBe("");
  });

  test("sin voz propia ni del proyecto no hay con qué registrarlo", () => {
    expect(faltaDeVoz(ana, [], "", "ana")).toContain("no tiene ninguna voz registrada");
  });

  test("si ninguno es la protagonista y los dos usarían la del proyecto, se pide a los dos", () => {
    expect(faltaDeVoz(ana, [ana, bea], "audio-proyecto", null)).toContain("«Bea»");
    expect(faltaDeVoz(bea, [ana, bea], "audio-proyecto", null)).toContain("«Ana»");
  });
});
