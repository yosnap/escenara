import { describe, expect, it } from "bun:test";
import { efectosDelOrden, ordenAplicable } from "./orden-escenas";

describe("ordenAplicable", () => {
  it("no hay orden pendiente si no se ha movido nada o vuelve a como estaba", () => {
    expect(ordenAplicable(null, ["a", "b"])).toBeNull();
    expect(ordenAplicable(["a", "b"], ["a", "b"])).toBeNull();
  });

  it("devuelve el orden pendiente cuando es una permutación de las escenas actuales", () => {
    expect(ordenAplicable(["b", "a", "c"], ["a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  it("se descarta si ya no son las mismas escenas (se añadió o borró alguna)", () => {
    expect(ordenAplicable(["b", "a"], ["a", "b", "c"])).toBeNull();
    expect(ordenAplicable(["b", "x"], ["a", "b"])).toBeNull();
    expect(ordenAplicable(["a", "a"], ["a", "b"])).toBeNull();
  });
});

describe("efectosDelOrden", () => {
  it("sin escenas aprobadas ni producidas lo dice y no habla de clips", () => {
    const texto = efectosDelOrden(["borrador", "borrador"]);
    expect(texto).toContain("Todavía no hay escenas aprobadas ni producidas");
    expect(texto).not.toContain("clips ya hechos");
  });

  it("con aprobadas y producidas cuenta cuántas y aclara que no quita la aprobación ni cobra", () => {
    const texto = efectosDelOrden(["aprobada", "producida", "producida", "borrador"]);
    expect(texto).toContain("1 aprobada y 2 producidas");
    expect(texto).toContain("no quita su aprobación");
    expect(texto).toContain("no repite ni cobra nada");
  });

  it("siempre avisa de lo que sí cambia: números, primera escena y orden del montaje", () => {
    for (const estados of [["borrador"], ["aprobada"]] as const) {
      const texto = efectosDelOrden(estados);
      expect(texto).toContain("números de escena");
      expect(texto).toContain("la primera lleva el gancho");
      expect(texto).toContain("montaje que ya hayas guardado mantiene el suyo");
    }
  });
});
