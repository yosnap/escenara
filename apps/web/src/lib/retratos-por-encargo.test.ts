import { describe, expect, test } from "bun:test";
import { RETRATOS_CANDIDATOS, rangoDeRetratos, retratosEnPalabras, retratosPorEncargo } from "./omni";

describe("retratos que se pueden pedir de una vez", () => {
  test("nunca pasan del tope de trabajos simultáneos ni de los candidatos", () => {
    expect(retratosPorEncargo(3)).toBe(3);
    expect(retratosPorEncargo(10)).toBe(RETRATOS_CANDIDATOS);
    expect(retratosPorEncargo(1)).toBe(1);
    expect(retratosPorEncargo(0)).toBe(1);
    expect(retratosPorEncargo(null)).toBe(RETRATOS_CANDIDATOS);
  });

  test("se dicen con palabras", () => {
    expect(retratosEnPalabras(3)).toBe("tres retratos");
    expect(retratosEnPalabras(1)).toBe("un retrato");
    expect(rangoDeRetratos(3)).toBe("de uno a tres retratos");
    expect(rangoDeRetratos(1)).toBe("un retrato");
  });
});
