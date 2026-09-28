import { describe, expect, test } from "bun:test";
import { motivoNombreReal, nombraAPersonaReal, nombresRealesEn } from "./nombres-reales";

/**
 * Detección de nombres de personas reales en el texto de un personaje inventado (RF10, 0.22.0).
 *
 * Es un **control, no una verificación**, y estos tests fijan hasta dónde llega: reconoce el nombre completo y
 * también el apellido o el apodo por el que se conoce a esa misma persona, porque quitar una palabra no puede
 * ser la forma de saltárselo.
 */
describe("nombres de personas reales", () => {
  test("reconoce el nombre completo, sin importar mayúsculas ni acentos", () => {
    // Se queda el nombre completo y no además su apodo: es una persona, no dos.
    expect(nombresRealesEn("Se parece a Scarlett Johansson")).toEqual(["scarlett johansson"]);
    expect(nombraAPersonaReal("igual que PENÉLOPE CRUZ")).toBe(true);
  });

  test("reconoce también el apellido o el apodo por el que se les conoce", () => {
    // El hallazgo de la revisión: con solo nombres completos, «Messi» y «Obama» se colaban.
    for (const texto of ["con la cara de Messi", "estilo Obama", "un gesto como Bardem", "parecido a The Rock"]) {
      expect(nombraAPersonaReal(texto)).toBe(true);
    }
  });

  test("no marca una descripción normal ni una palabra que solo contenga un nombre a medias", () => {
    expect(nombresRealesEn("Mujer de unos treinta años, pelo corto castaño y chaqueta vaquera")).toEqual([]);
    // Dentro de otra palabra no dispara: se compara con los límites de palabra ya normalizados.
    expect(nombraAPersonaReal("lleva unas messinas de cuero")).toBe(false);
  });

  test("el motivo dice qué nombre se ha encontrado y qué hacer", () => {
    const motivo = motivoNombreReal(nombresRealesEn("como Messi"));
    expect(motivo).toContain("Messi");
    expect(motivo).toContain("Descríbelo");
  });
});
