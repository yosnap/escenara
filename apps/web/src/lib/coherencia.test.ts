import { describe, expect, it } from "bun:test";
import {
  COMPROBACIONES,
  descripcionDeModoPara,
  efectoDeComprobacion,
  nombreDeModoPara,
  textoDeEfecto,
} from "./coherencia";

describe("efecto de una comprobación según su modo", () => {
  it("en sombra ninguna decide, ni siquiera el parecido: solo informa y la cobertura no cuenta con él", () => {
    for (const c of COMPROBACIONES) expect(efectoDeComprobacion(c, "sombra")).toBe("informa");
  });

  it("en Activa solo decide el parecido (identidad)", () => {
    expect(efectoDeComprobacion("identidad", "activa")).toBe("decide");
    for (const c of COMPROBACIONES.filter((x) => x !== "identidad")) {
      expect(efectoDeComprobacion(c, "activa")).toBe("informa");
    }
  });

  it("apagada no hace nada", () => {
    expect(efectoDeComprobacion("identidad", "apagada")).toBe("apagada");
  });

  it("el texto dice la verdad de cada caso", () => {
    expect(textoDeEfecto("identidad", "sombra")).toContain("En sombra: informa y no decide");
    expect(textoDeEfecto("identidad", "activa")).toContain("decide la cobertura");
    expect(textoDeEfecto("guion", "activa")).toContain("todavía solo informa");
    expect(textoDeEfecto("guion", "activa")).not.toContain("decide la cobertura");
    expect(textoDeEfecto("resultado", "sombra")).toContain("no decide nada");
  });

  it("en la revisión de una escena el parecido solo informa, también en Activa", () => {
    expect(textoDeEfecto("identidad", "activa", "escena")).toContain("Aquí solo informa");
    expect(textoDeEfecto("identidad", "sombra", "escena")).toContain("Aquí solo informa");
    expect(textoDeEfecto("identidad", "apagada", "escena")).toContain("Apagada");
  });

  it("la etiqueta y la descripción del modo Activa dependen de la comprobación", () => {
    expect(nombreDeModoPara("identidad", "activa")).toBe("Activa (decide la cobertura)");
    expect(nombreDeModoPara("guion", "activa")).toBe("Activa (todavía solo informa)");
    expect(nombreDeModoPara("identidad", "sombra")).toContain("En sombra");
    expect(descripcionDeModoPara("identidad", "activa")).toContain("decide la cobertura");
    expect(descripcionDeModoPara("guion", "activa")).not.toContain("decide la cobertura");
    expect(descripcionDeModoPara("identidad", "sombra")).toContain("tampoco la cobertura");
  });
});
