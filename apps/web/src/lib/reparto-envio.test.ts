import { describe, expect, test } from "bun:test";
import { noCabeElDialogo, palabrasDe, palabrasDeTurnos, segundosNecesarios } from "./reparto-envio";

/**
 * **¿Cabe el diálogo en el clip?** (0.28.0). Es una estimación y avisa, no bloquea, pero tiene que avisar
 * **antes** de cobrar: un clip de 4 s cortado a media frase es dinero tirado.
 */

describe("palabras de los turnos", () => {
  test("cuenta palabras aunque haya saltos de línea y espacios de sobra", () => {
    expect(palabrasDe("  Hola,   ¿qué\ntal?  ")).toBe(3);
    expect(palabrasDe("   ")).toBe(0);
  });

  test("suma las de todos los turnos", () => {
    expect(palabrasDeTurnos([{ texto: "uno dos" }, { texto: "tres" }])).toBe(3);
  });
});

describe("si cabe en la duración", () => {
  test("a 2,5 palabras por segundo, diez palabras necesitan cuatro segundos", () => {
    expect(segundosNecesarios(10)).toBe(4);
    expect(noCabeElDialogo(10, 4)).toBe(false);
    expect(noCabeElDialogo(11, 4)).toBe(true);
  });

  test("sin palabras o sin duración conocida no se avisa de nada", () => {
    expect(noCabeElDialogo(0, 4)).toBe(false);
    expect(noCabeElDialogo(40, 0)).toBe(false);
  });
});
