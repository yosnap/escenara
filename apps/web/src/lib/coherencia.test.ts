import { describe, expect, it } from "bun:test";
import { COMPROBACIONES, efectoDeComprobacion, textoDeEfecto } from "./coherencia";

describe("efecto de una comprobación según su modo", () => {
  it("en sombra ninguna decide, ni siquiera el parecido", () => {
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
    expect(textoDeEfecto("identidad", "activa")).toContain("decide de verdad");
    expect(textoDeEfecto("guion", "activa")).toContain("todavía solo informa");
    expect(textoDeEfecto("guion", "activa")).not.toContain("decide de verdad");
    expect(textoDeEfecto("resultado", "sombra")).toContain("no decide nada");
  });
});
